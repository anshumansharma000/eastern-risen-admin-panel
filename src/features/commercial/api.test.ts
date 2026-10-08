import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("passes debounced invoice search, page and pageSize to the full register endpoint", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [],
        pagination: { page: 2, pageSize: 25, total: 26 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const { commercialApi } = await import("./api");
  const response = await commercialApi.availableInvoices(
    "booking-id",
    "Asha Guest",
    2,
    25,
  );
  expect(response.pagination).toEqual({ page: 2, pageSize: 25, total: 26 });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.example.test/api/v1/core/commercial-bookings/booking-id/available-invoices?q=Asha+Guest&page=2&pageSize=25",
    expect.objectContaining({ credentials: "include" }),
  );
});

it("links by invoice number and financial year", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.example.test");
  vi.resetModules();
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const { commercialApi } = await import("./api");
  await commercialApi.linkInvoice("booking-id", {
    invoiceNumber: "ER/2627/1",
    financialYear: "2026-27",
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.example.test/api/v1/core/commercial-bookings/booking-id/invoice",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        invoiceNumber: "ER/2627/1",
        financialYear: "2026-27",
      }),
    }),
  );
});

it("uses the structured quote, review and single enablement contracts without an idempotency header", async () => {
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
  const { commercialApi } = await import("./api");
  const calculation = {
    lines: [
      {
        description: "Tour",
        amount: "100.00",
        taxTreatment: "NON_TAXABLE" as const,
        taxComponents: [],
      },
    ],
    taxEffectiveDate: "2026-10-07",
    paymentPlan: { mode: "COMPANY_DEFAULT" as const },
  };
  await commercialApi.calculateQuote("booking/id", calculation);
  await commercialApi.quote("booking/id", {
    ...calculation,
    description: "Tour",
    inclusions: "",
    exclusions: "",
    terms: "Terms",
  });
  const details = {
    invoiceDate: "2026-10-07",
    guestDisplayText: "Group",
    serviceProvidedAt: "ODISHA",
    placeOfSupplyState: "ODISHA",
    placeOfSupplyCountry: "INDIA",
    bankAccountIds: [],
  };
  await commercialApi.billingReview("booking/id", details);
  const enable = {
    quoteId: "quote",
    reviewToken: "token",
    invoiceDetails: details,
  };
  await commercialApi.enablePayment("booking/id", enable);
  const paths = [
    "quotes/calculate",
    "quotes",
    "billing-review",
    "enable-payment",
  ];
  paths.forEach((path, index) =>
    expect(fetch.mock.calls[index][0]).toBe(
      `https://api.example.test/api/v1/core/commercial-bookings/booking%2Fid/${path}`,
    ),
  );
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(details);
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual(enable);
  fetch.mock.calls.forEach(([, options]) => {
    expect(options.cache).toBe("no-store");
    expect(options.credentials).toBe("include");
    expect(options.headers).not.toHaveProperty("Idempotency-Key");
  });
});
