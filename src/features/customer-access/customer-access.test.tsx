// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, getResource } from "@/lib/api/client";
import type { CoreMaster, CoreRole } from "@/lib/api/contracts";
import { accessApi, type Invitation, type InvitationResult } from "./api";
import { CustomerAccessDialog } from "./customer-access";
import { MasterPage } from "@/features/masters/master-page";
import { configs } from "@/features/masters/master-config";
import { getCollection } from "@/lib/api/client";
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  getResource: vi.fn(),
  getCollection: vi.fn(),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  accessApi: { read: vi.fn(), invite: vi.fn(), revoke: vi.fn() },
}));
const customer: CoreMaster = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Reviewed Customer",
  category: "CORPORATE",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const invitation: Invitation = {
  id: "i",
  displayName: "Invited Contact",
  email: "contact@example.test",
  createdAt: "2026-10-01T00:00:00Z",
  expiresAt: "2099-10-04T00:00:00Z",
  consumedAt: null,
  revokedAt: null,
};
function created(
  delivery = "MANUAL",
  activationUrl:
    | string
    | null = `https://accounts.example.test/activate#token=${"z".repeat(43)}`,
): InvitationResult {
  return {
    id: "new",
    email: invitation.email,
    displayName: invitation.displayName,
    expiresAt: invitation.expiresAt,
    activationUrl,
    delivery,
  };
}
let cache: QueryClient;
const close = vi.fn();
function open(record = customer, role: CoreRole = "CORE_ADMIN") {
  return render(
    <QueryClientProvider client={cache}>
      <CustomerAccessDialog customer={record} role={role} onClose={close} />
    </QueryClientProvider>,
  );
}
async function form() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Invite contact" }),
  );
  fireEvent.change(screen.getByLabelText("Contact name"), {
    target: { value: "Invited Contact" },
  });
  fireEvent.change(screen.getByLabelText("Contact email"), {
    target: { value: "Contact@Example.Test" },
  });
  fireEvent.blur(screen.getByLabelText("Contact email"));
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
}
beforeEach(() => {
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(getResource).mockResolvedValue({ data: customer });
  vi.mocked(getCollection).mockResolvedValue({
    data: [customer],
    pagination: { page: 1, pageSize: 25, total: 1 },
  });
  vi.mocked(accessApi.read).mockResolvedValue({
    data: { memberships: [], invitations: [] },
  });
  vi.mocked(accessApi.invite).mockResolvedValue(created());
  vi.mocked(accessApi.revoke).mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.clearAllMocks();
});
it.each<CoreRole>(["CORE_DATA_ENTRY", "CORE_REPORT_VIEWER"])(
  "hides controls and never fetches access for %s",
  async (role) => {
    const dialog = open(customer, role);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(accessApi.read).not.toHaveBeenCalled();
    dialog.unmount();
    render(
      <QueryClientProvider client={cache}>
        <MasterPage config={configs.customers} role={role} />
      </QueryClientProvider>,
    );
    await screen.findByText("Reviewed Customer");
    expect(
      screen.queryByRole("button", { name: "Account access" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Statement" })).toBeInTheDocument();
  },
);
it("opens access from the admin customer register while retaining the master editor", async () => {
  render(
    <QueryClientProvider client={cache}>
      <MasterPage config={configs.customers} role="CORE_ADMIN" />
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Account access" }),
  );
  expect(await screen.findByText("No memberships")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
});
it.each(["MANUAL", "QUEUED"])(
  "creates with %s delivery, copies supplied link and clears all result data on dismissal",
  async (delivery) => {
    vi.mocked(accessApi.invite).mockResolvedValue(created(delivery));
    open();
    await screen.findByText("No memberships");
    await form();
    expect(
      await screen.findByText(
        delivery === "QUEUED"
          ? "Invitation queued for email"
          : "Copy and share this invitation with the verified contact.",
      ),
    ).toBeInTheDocument();
    expect(accessApi.invite).toHaveBeenCalledWith(customer.id, {
      displayName: "Invited Contact",
      email: "contact@example.test",
    });
    if (delivery === "QUEUED")
      expect(
        screen.getByText("Queueing does not confirm inbox delivery."),
      ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await screen.findByRole("button", { name: "Copied" });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      created().activationUrl,
    );
    expect(
      JSON.stringify(
        cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("#token=");
    expect(cache.getMutationCache().getAll()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Activation URL")).not.toBeInTheDocument();
    expect(accessApi.read).toHaveBeenCalledTimes(2);
  },
);
it("shows configuration guidance without guessing an activation URL", async () => {
  vi.mocked(accessApi.invite).mockResolvedValue(created("MANUAL", null));
  open();
  await screen.findByText("No memberships");
  await form();
  expect(
    await screen.findByText(/No activation URL is configured/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Copy link" }),
  ).not.toBeInTheDocument();
});
it("resends through invitation creation and explains that old links stop working", async () => {
  vi.mocked(accessApi.read).mockResolvedValue({
    data: { memberships: [], invitations: [invitation] },
  });
  open();
  const resend = await screen.findByRole("button", { name: "Resend" });
  expect(
    screen.getByText(/immediately invalidates the old link/),
  ).toBeInTheDocument();
  fireEvent.click(resend);
  await screen.findByLabelText("Activation URL");
  expect(accessApi.invite).toHaveBeenCalledOnce();
  expect(accessApi.invite).toHaveBeenCalledWith(customer.id, invitation);
});
it("confirms person and customer, preserves independent booking links and uses membership id", async () => {
  vi.mocked(accessApi.read).mockResolvedValue({
    data: {
      memberships: [
        {
          id: "relationship-id",
          accountId: "person-id",
          displayName: "Member Contact",
          email: invitation.email,
          status: "DEACTIVATED",
          createdAt: invitation.createdAt,
          revokedAt: null,
        },
      ],
      invitations: [],
    },
  });
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Revoke access" }));
  expect(
    screen.getByText("Revoke access for Member Contact?"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Previously shared booking links remain valid/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/contact@example.test · Reviewed Customer/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  await screen.findByText(/Revocation completed/);
  expect(accessApi.revoke).toHaveBeenCalledWith(
    customer.id,
    "memberships",
    "relationship-id",
  );
});
it("allows expired invitation revocation and disables invites for inactive customers with history visible", async () => {
  const inactive = { ...customer, status: "INACTIVE" as const };
  vi.mocked(getResource).mockResolvedValue({ data: inactive });
  vi.mocked(accessApi.read).mockResolvedValue({
    data: {
      memberships: [],
      invitations: [{ ...invitation, expiresAt: "2020-01-01T00:00:00Z" }],
    },
  });
  open(inactive);
  expect(await screen.findByRole("button", { name: "Resend" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Invite contact" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  await waitFor(() =>
    expect(accessApi.revoke).toHaveBeenCalledWith(
      customer.id,
      "invitations",
      invitation.id,
    ),
  );
});
it("refreshes after an uncertain POST without retrying or showing success", async () => {
  vi.mocked(accessApi.invite).mockRejectedValue(
    new ApiError(0, "NETWORK_ERROR", "Connection lost"),
  );
  open();
  await screen.findByText("No memberships");
  await form();
  await screen.findByText(/The invitation may have been created/);
  await waitFor(() => expect(accessApi.read).toHaveBeenCalledTimes(2));
  expect(accessApi.invite).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Activation URL")).not.toBeInTheDocument();
});
it("maps actual body validation fields and request id without raw diagnostics", async () => {
  vi.mocked(accessApi.invite).mockRejectedValue(
    new ApiError(
      400,
      "REQUEST_VALIDATION_FAILED",
      "Correct the form",
      "request-1",
      { fields: [{ field: "body.email", message: "Use another email" }] },
      "private diagnostics",
    ),
  );
  open();
  await screen.findByText("No memberships");
  await form();
  await screen.findByText("Use another email");
  expect(screen.getByText("request-1")).toBeInTheDocument();
  expect(screen.queryByText("private diagnostics")).not.toBeInTheDocument();
});
it("handles permission removal and missing API deployment", async () => {
  vi.mocked(accessApi.read).mockRejectedValue(
    new ApiError(404, "ROUTE_NOT_FOUND", "Route not found"),
  );
  const rendered = open();
  expect(
    await screen.findByText(/Verify that the deployed API/),
  ).toBeInTheDocument();
  rendered.unmount();
  cache.clear();
  vi.mocked(accessApi.read).mockRejectedValue(
    new ApiError(
      403,
      "CORE_ACCESS_REQUIRED",
      "No account access administration permission",
    ),
  );
  open();
  await screen.findByText("No account access administration permission");
  expect(
    screen.queryByRole("button", { name: "Invite contact" }),
  ).not.toBeInTheDocument();
});
it("returns to staff login and clears cache on 401", async () => {
  cache.setQueryData(["session"], { secret: "staff-session" });
  vi.mocked(accessApi.read).mockRejectedValue(
    new ApiError(401, "AUTHENTICATION_REQUIRED", "Sign in"),
  );
  open();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(cache.getQueryData(["session"])).toBeUndefined();
  expect(close).toHaveBeenCalled();
});
it("ignores a late invitation response when the selected customer changes", async () => {
  let resolve!: (result: InvitationResult) => void;
  vi.mocked(accessApi.invite).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const rendered = open();
  await screen.findByText("No memberships");
  await form();
  expect(
    screen.getByRole("button", { name: "Creating invitation…" }),
  ).toBeDisabled();
  const other = {
    ...customer,
    id: "22222222-2222-4222-8222-222222222222",
    name: "Other Customer",
  };
  vi.mocked(getResource).mockResolvedValue({ data: other });
  rendered.rerender(
    <QueryClientProvider client={cache}>
      <CustomerAccessDialog
        customer={other}
        role="CORE_ADMIN"
        onClose={close}
      />
    </QueryClientProvider>,
  );
  resolve(created());
  await screen.findByText("No memberships");
  expect(screen.queryByLabelText("Activation URL")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog")).toHaveTextContent("Other Customer");
});
it("keeps two simultaneous customer views and queries distinct", async () => {
  const other = {
    ...customer,
    id: "22222222-2222-4222-8222-222222222222",
    name: "Other Customer",
  };
  vi.mocked(getResource).mockImplementation(async (path) => ({
    data: path.includes(other.id) ? other : customer,
  }));
  render(
    <QueryClientProvider client={cache}>
      <CustomerAccessDialog
        customer={customer}
        role="CORE_ADMIN"
        onClose={close}
      />
      <CustomerAccessDialog
        customer={other}
        role="CORE_ADMIN"
        onClose={close}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getAllByText("No memberships")).toHaveLength(2),
  );
  const dialogs = screen.getAllByRole("dialog");
  fireEvent.click(
    within(dialogs[0]).getByRole("button", { name: "Invite contact" }),
  );
  expect(
    within(dialogs[0]).getByText("Invite contact to Reviewed Customer"),
  ).toBeInTheDocument();
  expect(
    within(dialogs[1]).queryByLabelText("Contact email"),
  ).not.toBeInTheDocument();
  expect(cache.getQueryData(["customer-access", customer.id])).toBeDefined();
  expect(cache.getQueryData(["customer-access", other.id])).toBeDefined();
});
it("traps keyboard focus, closes on Escape and restores focus", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  open();
  await screen.findByText("No memberships");
  const closeButton = screen.getByRole("button", { name: "Close dialog" });
  closeButton.focus();
  fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "Refresh access" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  cleanup();
  expect(opener).toHaveFocus();
  opener.remove();
});

it("respects rate-limit cooldown and allows retry later without automatic POST", async () => {
  const error = new ApiError(
    429,
    "RATE_LIMIT_EXCEEDED",
    "Rate limited",
    "req-rate",
    undefined,
    undefined,
    120,
  );
  vi.mocked(accessApi.invite).mockRejectedValue(error);
  open();
  await screen.findByText("No memberships");
  await form();
  await screen.findByText(/Rate limit reached/);
  expect(
    screen.getByRole("button", { name: "Create invitation" }),
  ).toBeDisabled();
  expect(accessApi.invite).toHaveBeenCalledOnce();
  const realNow = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(realNow + 121_000);
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create invitation" }),
    ).toBeEnabled(),
  );
  clock.mockRestore();
});
it.each([
  "CUSTOMER_ALREADY_HAS_ACCESS",
  "CUSTOMER_EMAIL_UNAVAILABLE",
  "CUSTOMER_UNAVAILABLE",
])("handles %s without fabricating an invitation", async (code) => {
  vi.mocked(accessApi.invite).mockRejectedValue(
    new ApiError(
      code === "CUSTOMER_UNAVAILABLE" ? 404 : 409,
      code,
      "Action rejected",
      "req-conflict",
    ),
  );
  open();
  await screen.findByText("No memberships");
  await form();
  await screen.findByText("Action rejected");
  await waitFor(() => expect(accessApi.read).toHaveBeenCalledTimes(2));
  expect(screen.queryByLabelText("Activation URL")).not.toBeInTheDocument();
  if (code === "CUSTOMER_ALREADY_HAS_ACCESS")
    expect(screen.getByText(/no new invitation is needed/)).toBeInTheDocument();
  if (code === "CUSTOMER_EMAIL_UNAVAILABLE")
    expect(
      screen.getByText(/Staff accounts cannot be converted/),
    ).toBeInTheDocument();
  if (code === "CUSTOMER_UNAVAILABLE")
    expect(
      screen.getByRole("button", { name: "Create invitation" }),
    ).toBeDisabled();
});
it("does not claim stale invitation revocation succeeded", async () => {
  vi.mocked(accessApi.read).mockResolvedValue({
    data: { memberships: [], invitations: [invitation] },
  });
  vi.mocked(accessApi.revoke).mockRejectedValue(
    new ApiError(
      404,
      "INVITATION_NOT_FOUND",
      "Invitation changed",
      "req-stale",
    ),
  );
  open();
  fireEvent.click(
    await screen.findByRole("button", { name: "Revoke invitation" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  await screen.findByText(/access was not confirmed revoked/);
  expect(screen.queryByText(/Revocation completed/)).not.toBeInTheDocument();
  await waitFor(() => expect(accessApi.read).toHaveBeenCalledTimes(2));
});
it("expires an invitation in a long-open view and refreshes its state on focus", async () => {
  const instant = Date.now();
  vi.mocked(accessApi.read).mockResolvedValue({
    data: {
      memberships: [],
      invitations: [
        { ...invitation, expiresAt: new Date(instant + 60_000).toISOString() },
      ],
    },
  });
  open();
  await screen.findByText("PENDING");
  const clock = vi.spyOn(Date, "now").mockReturnValue(instant + 60_001);
  fireEvent(window, new Event("focus"));
  await screen.findByText("EXPIRED");
  clock.mockRestore();
});
it("handles non-validation error details safely", async () => {
  vi.mocked(accessApi.invite).mockRejectedValue(
    new ApiError(
      400,
      "REQUEST_VALIDATION_FAILED",
      "Correct the form",
      "req-safe",
      { fields: "not-an-array" } as never,
    ),
  );
  open();
  await screen.findByText("No memberships");
  await form();
  await screen.findByText("Correct the form");
  expect(screen.getByText("req-safe")).toBeInTheDocument();
});

it("clears the activation URL on modal close even before parent unmount", async () => {
  open();
  await screen.findByText("No memberships");
  await form();
  await screen.findByLabelText("Activation URL");
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByLabelText("Activation URL")).not.toBeInTheDocument();
  expect(close).toHaveBeenCalledOnce();
  expect(cache.getMutationCache().getAll()).toHaveLength(0);
});
it("blocks immediate read retry during a server-provided cooldown", async () => {
  vi.mocked(accessApi.read).mockRejectedValue(
    new ApiError(
      429,
      "RATE_LIMIT_EXCEEDED",
      "Wait before retrying",
      "req-read",
      undefined,
      undefined,
      120,
    ),
  );
  open();
  await screen.findByText("Wait before retrying");
  expect(screen.getByRole("button", { name: "Refresh access" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeInTheDocument();
  expect(accessApi.read).toHaveBeenCalledOnce();
});
