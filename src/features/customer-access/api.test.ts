import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invitationState,
  membershipAccess,
  type Invitation,
  type Membership,
} from "./api";

const invitation: Invitation = {
  id: "i",
  email: "contact@example.test",
  displayName: "Contact",
  createdAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-10-04T00:00:00Z",
  consumedAt: null,
  revokedAt: null,
};
const membership: Membership = {
  id: "m",
  accountId: "a",
  email: invitation.email,
  displayName: invitation.displayName,
  status: "ACTIVE",
  createdAt: invitation.createdAt,
  revokedAt: null,
};
const customerId = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("access state", () => {
  it("uses consumed, revoked, expired, pending precedence at the expiry boundary", () => {
    const now = Date.parse(invitation.expiresAt);
    expect(invitationState(invitation, now - 1)).toBe("PENDING");
    expect(invitationState(invitation, now)).toBe("EXPIRED");
    expect(
      invitationState({ ...invitation, revokedAt: invitation.createdAt }, now),
    ).toBe("REVOKED");
    expect(
      invitationState(
        {
          ...invitation,
          consumedAt: invitation.createdAt,
          revokedAt: invitation.createdAt,
        },
        now,
      ),
    ).toBe("ACCEPTED");
  });
  it("keeps lifecycle, membership revocation and customer availability separate, including future statuses", () => {
    expect(membershipAccess(membership, "ACTIVE")).toBe("ACTIVE");
    expect(membershipAccess(membership, "INACTIVE")).toBe(
      "CUSTOMER_UNAVAILABLE",
    );
    expect(
      membershipAccess({ ...membership, status: "FUTURE_STATUS" }, "ACTIVE"),
    ).toBe("ACCOUNT_UNAVAILABLE");
    expect(
      membershipAccess({ ...membership, status: "DEACTIVATED" }, "ACTIVE"),
    ).toBe("ACCOUNT_UNAVAILABLE");
    expect(
      membershipAccess(
        { ...membership, revokedAt: invitation.createdAt },
        "ARCHIVED",
      ),
    ).toBe("REVOKED");
  });
});
it("uses exact staff paths/payloads and discards the raw credential, including resend", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          id: "i",
          email: invitation.email,
          displayName: "Contact",
          expiresAt: invitation.expiresAt,
          activationUrl: null,
          activationToken: "x".repeat(43),
          delivery: "MANUAL",
        },
      }),
      { status: 201 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const { accessApi } = await import("./api");
  const result = await accessApi.invite(customerId, {
    email: " Contact@Example.Test ",
    displayName: " Contact ",
  });
  expect(result).not.toHaveProperty("activationToken");
  expect(fetch).toHaveBeenCalledWith(
    `https://api.example.test/api/v1/core/customers/${customerId}/invitations`,
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ email: invitation.email, displayName: "Contact" }),
    }),
  );
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: { memberships: [membership], invitations: [invitation] },
      }),
      { status: 200 },
    ),
  );
  expect((await accessApi.read(customerId)).data.memberships[0].accountId).toBe(
    "a",
  );
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    accessApi.revoke(customerId, "memberships", "membership-id"),
  ).resolves.toBeUndefined();
  expect(fetch).toHaveBeenLastCalledWith(
    `https://api.example.test/api/v1/core/customers/${customerId}/memberships/membership-id`,
    expect.objectContaining({
      method: "DELETE",
      credentials: "include",
      body: undefined,
    }),
  );
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    accessApi.revoke(customerId, "invitations", "invitation-id"),
  ).resolves.toBeUndefined();
});
it("does not treat an HTML or empty success response as empty access data", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response("<html>proxy failure</html>", { status: 200 }),
    );
  vi.stubGlobal("fetch", fetch);
  const { accessApi } = await import("./api");
  await expect(accessApi.read(customerId)).rejects.toMatchObject({
    status: 200,
    code: "UNEXPECTED_RESPONSE",
  });
  fetch.mockResolvedValueOnce(new Response("", { status: 200 }));
  await expect(accessApi.read(customerId)).rejects.toMatchObject({
    code: "UNEXPECTED_RESPONSE",
  });
});

it("retains status, request id, arbitrary details and readable Retry-After on errors", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Wait",
            details: { fields: "unexpected" },
            requestId: "req-rate",
          },
        }),
        { status: 429, headers: { "Retry-After": "120" } },
      ),
    ),
  );
  const { accessApi } = await import("./api");
  await expect(accessApi.read(customerId)).rejects.toMatchObject({
    status: 429,
    requestId: "req-rate",
    retryAfterSeconds: 120,
  });
});
