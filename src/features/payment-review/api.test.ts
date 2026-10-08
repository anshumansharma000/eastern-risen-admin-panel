import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("uses internal UUID routes and preserves the resolution payload, cookie and idempotency header", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const { paymentReviewApi } = await import("./api");
  const body = {
    action: "APPLY_TO_LINKED_INVOICE" as const,
    note: "Verified",
    version: "opaque-version",
  };
  await paymentReviewApi.inspect("order-uuid");
  await paymentReviewApi.resolve("attempt-uuid", body, "original-key");
  await paymentReviewApi.reconcile("order-uuid");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "https://api.example.test/api/v1/core/payment-orders/order-uuid/review",
    "https://api.example.test/api/v1/core/payment-attempts/attempt-uuid/resolve",
    "https://api.example.test/api/v1/core/payment-orders/order-uuid/reconcile-by-id",
  ]);
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: "POST",
    credentials: "include",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": "original-key" },
  });
});

it("also uses the UUID reconciliation route from commercial booking details", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetch);
  const { commercialApi } = await import("@/features/commercial/api");
  await commercialApi.reconcile("order-uuid");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.example.test/api/v1/core/payment-orders/order-uuid/reconcile-by-id",
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
});
