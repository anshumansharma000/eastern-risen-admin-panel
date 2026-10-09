// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, api, apiBlob, getCollection } from "@/lib/api/client";
import type {
  PaymentReportRow,
  PaymentSummary,
  ReportEnvelope,
} from "./contracts";
import {
  PaymentsReceivedPage,
  paymentReportParams,
} from "./payments-received-page";
import { formatTimestamp } from "./report-shared";
import { paymentReviewApi } from "@/features/payment-review/api";
import type { PaymentReviewCase } from "@/features/payment-review/contracts";
import reviewExamples from "@/features/payment-review/review-fixtures.test-helper.json";

const replace = vi.hoisted(() => vi.fn());
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/payments-received",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
  getCollection: vi.fn(),
  apiBlob: vi.fn(),
}));

function payment(overrides: Partial<PaymentReportRow> = {}): PaymentReportRow {
  return {
    id: "gateway:order-1",
    source: "GATEWAY",
    amount: "56700.00",
    activityAt: "2026-10-06T18:30:00Z",
    createdAt: "2026-10-06T18:00:00Z",
    reportDate: "2026-10-07",
    receivedDate: null,
    paidAt: "2026-10-06T18:30:00Z",
    receiptId: null,
    receiptNumber: null,
    receiptStatus: null,
    receiptAmount: null,
    method: null,
    reversalReason: null,
    paymentOrderId: "order-1",
    gatewayStatus: "REVIEW_REQUIRED",
    provider: "cashfree",
    providerOrderId: "provider-order-1",
    providerPaymentId: "provider-payment-1",
    providerConfirmedReviewAmount: "56700.00",
    providerStatus: "PAID",
    recordedExternalRefundAmount: "0.00",
    resolutions: [],
    invoiceId: "invoice-1",
    invoiceNumber: "I/2627/12",
    bookingId: "booking-1",
    bookingReference: "Test12",
    companyId: "company-1",
    companyName: "Eastern Risen",
    customerId: "customer-1",
    customerName: "Example Customer",
    customerCategory: "LEISURE",
    serviceCategoryId: "service-1",
    serviceCategoryName: "Tour",
    details: {},
    attempts: [
      {
        id: "attempt-1",
        reviewReasons: [],
        receiptStatus: null,
        receiptAccountingState: null,
        providerPaymentId: "provider-payment-1",
        status: "SUCCESS",
        accountingStatus: "REVIEW_REQUIRED",
        amount: "56700.00",
        currency: "INR",
        receiptId: null,
        initiatedAt: "2026-10-06T18:29:00Z",
        completedAt: "2026-10-06T18:30:00Z",
      },
    ],
    ...overrides,
  };
}
const summary: PaymentSummary = {
  total: 130,
  manualCount: 80,
  gatewayCount: 50,
  confirmedReceiptCount: 75,
  confirmedReceiptAmount: "999999.00",
  pendingReceiptCount: 3,
  pendingReceiptAmount: "1500.00",
  reversedReceiptCount: 2,
  reversedReceiptAmount: "1000.00",
  providerConfirmedReviewAmount: "123456.00",
  recordedExternalRefundAmount: "0.00",
  gatewayStatusBreakdown: [
    { status: "PAID", count: 49, amount: "765432.00" },
    { status: "REVIEW_REQUIRED", count: 1, amount: "56700.00" },
  ],
};
function envelope(
  rows = [payment()],
): ReportEnvelope<PaymentReportRow, PaymentSummary> {
  return {
    data: rows,
    summary,
    pagination: { page: 1, pageSize: 25, total: 130 },
    meta: {
      currency: "INR",
      dateBasis: "PAYMENT_ACTIVITY_IST",
      from: null,
      to: null,
      balanceBasis: "CURRENT",
      generatedAt: "2026-10-07T11:00:00Z",
    },
  };
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <PaymentsReceivedPage />
    </QueryClientProvider>
  );
  const rendered = render(tree());
  return { ...rendered, refresh: () => rendered.rerender(tree()) };
}
beforeEach(() => {
  vi.mocked(getCollection).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
  vi.mocked(api).mockResolvedValue(envelope());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  searchParams = new URLSearchParams();
});

it("requests both sources, all states and all history without legacy filters", async () => {
  searchParams = new URLSearchParams("status=CONFIRMED&unknown=value");
  mount();
  await screen.findByText("Example Customer");
  expect(api).toHaveBeenCalledWith(
    "/reports/payments?page=1&pageSize=25",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByLabelText("Payment source")).toHaveValue("");
  expect(screen.getByLabelText("Receipt status")).toHaveValue("");
  expect(screen.getByLabelText("Gateway status")).toHaveValue("");
  expect(screen.getByLabelText("Sort by")).toHaveValue("activityAt");
  expect(screen.getByLabelText("Sort order")).toHaveValue("desc");
  expect(screen.getByText(/All history/)).toHaveTextContent(
    "All history to Present",
  );
  expect(screen.queryByText(/Financial year/)).not.toBeInTheDocument();
});

it("keeps status controls independent and resets pagination when filtering and sorting", async () => {
  searchParams = new URLSearchParams(
    "receiptStatus=REVERSED&gatewayStatus=PAID&page=3&method=GATEWAY",
  );
  const view = mount();
  await screen.findByText("Example Customer");
  const request = new URL(
    String(vi.mocked(api).mock.calls[0][0]),
    "http://test",
  );
  expect(request.searchParams.get("receiptStatus")).toBe("REVERSED");
  expect(request.searchParams.get("gatewayStatus")).toBe("PAID");
  expect(request.searchParams.has("status")).toBe(false);
  expect(
    within(screen.getByLabelText("Gateway status")).queryByRole("option", {
      name: "Pending",
    }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Receipt status"), {
    target: { value: "" },
  });
  expect(replace).toHaveBeenLastCalledWith(
    "/reports/payments-received?gatewayStatus=PAID&method=GATEWAY",
    { scroll: false },
  );
  searchParams = new URLSearchParams(
    "gatewayStatus=PAID&method=GATEWAY&page=3",
  );
  view.refresh();
  fireEvent.change(screen.getByLabelText("Gateway status"), {
    target: { value: "READY" },
  });
  expect(replace).toHaveBeenLastCalledWith(
    "/reports/payments-received?gatewayStatus=READY&method=GATEWAY",
    { scroll: false },
  );
  fireEvent.change(screen.getByLabelText("Sort by"), {
    target: { value: "amount" },
  });
  expect(replace).toHaveBeenLastCalledWith(
    "/reports/payments-received?gatewayStatus=PAID&method=GATEWAY&sortBy=amount",
    { scroll: false },
  );
});

it("renders unreceipted review orders, direct calendar dates, India timestamps and safe attempt details", async () => {
  mount();
  await screen.findByText("Example Customer");
  const row = screen.getByText("Example Customer").closest("tr")!;
  expect(within(row).getByText("2026-10-07")).toBeInTheDocument();
  expect(
    within(row).getByLabelText("Gateway review required"),
  ).toBeInTheDocument();
  expect(within(row).getAllByText("—")).toHaveLength(3);
  expect(
    within(row).getByText(/verified funds awaiting review/),
  ).toHaveTextContent("₹56,700.00");
  expect(formatTimestamp("2026-10-06T18:30:00Z")).toMatch(
    /7 Oct 2026.*12:00 am/,
  );
  expect(within(row).getByRole("link", { name: "Test12" })).toHaveAttribute(
    "href",
    "/commercial-bookings/detail?id=booking-1",
  );
  fireEvent.click(within(row).getByRole("button", { name: "View details" }));
  const details = screen.getByRole("region", { name: "Payment details" });
  expect(within(details).getAllByText("provider-payment-1")).toHaveLength(2);
  const attempts = within(details).getByRole("table", {
    name: "Payment attempts",
  });
  expect(attempts).toHaveTextContent("SUCCESS");
  expect(attempts).toHaveTextContent("REVIEW REQUIRED");
  expect(
    screen.queryByRole("button", { name: /reconcil|refund|resolve/i }),
  ).not.toBeInTheDocument();
});

it("shows paid and reversed independently and preserves additional verified review funds", async () => {
  vi.mocked(api).mockResolvedValue(
    envelope([
      payment({
        gatewayStatus: "PAID",
        receiptStatus: "REVERSED",
        receiptId: "receipt-1",
        receiptNumber: "R/1",
        method: "GATEWAY",
        receiptAmount: "50000.00",
        reversalReason: "Correcting receipt",
      }),
    ]),
  );
  mount();
  await screen.findByLabelText("Gateway paid");
  expect(screen.getByLabelText("Receipt reversed")).toBeInTheDocument();
  expect(screen.getByText(/₹56,700.00 verified funds/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(screen.getByText("Correcting receipt")).toBeInTheDocument();
  expect(
    screen.getByText(/This does not establish that a gateway refund occurred/),
  ).toBeInTheDocument();
});

it("uses server summaries for the whole result and does not infer source from gateway method", async () => {
  vi.mocked(api).mockResolvedValue(
    envelope([
      payment({
        id: "manual:r1",
        source: "MANUAL",
        method: "GATEWAY",
        attempts: [],
        gatewayStatus: null,
        provider: null,
        providerConfirmedReviewAmount: "0.00",
      }),
    ]),
  );
  mount();
  await screen.findByText("Manual / unlinked receipt");
  const summaries = screen.getAllByRole("region", { name: "Report summary" });
  expect(summaries[0]).toHaveTextContent("130");
  expect(summaries[0]).toHaveTextContent("80 manual · 50 gateway");
  expect(summaries[0]).toHaveTextContent("₹9,99,999.00");
  expect(summaries[0]).toHaveTextContent("₹1,23,456.00");
  expect(summaries[1]).toHaveTextContent("₹7,65,432.00");
  expect(
    screen.queryByText(/total amount|total received/i),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(replace).toHaveBeenLastCalledWith(
    "/reports/payments-received?page=2",
    { scroll: false },
  );
});

it("exports the full filtered report with the server filename and without pagination", async () => {
  searchParams = new URLSearchParams(
    "source=GATEWAY&gatewayStatus=PAID&receiptStatus=REVERSED&page=2&pageSize=50&sortBy=amount&sortOrder=asc&q= Test12 ",
  );
  vi.mocked(apiBlob).mockResolvedValue({
    blob: new Blob(["id,source"]),
    disposition: 'attachment; filename="payments.csv"',
  });
  const createObjectURL = vi.fn(() => "blob:payments");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
  let filename = "";
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    filename = this.download;
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(apiBlob).toHaveBeenCalledOnce());
  const exported = new URL(
    String(vi.mocked(apiBlob).mock.calls[0][0]),
    "http://test",
  );
  expect(exported.pathname).toBe("/reports/payments/export");
  expect(Object.fromEntries(exported.searchParams)).toEqual({
    source: "GATEWAY",
    gatewayStatus: "PAID",
    receiptStatus: "REVERSED",
    sortBy: "amount",
    sortOrder: "asc",
    q: "Test12",
  });
  expect(filename).toBe("payments.csv");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:payments");
});

it("asks for narrower filters when CSV exceeds the server limit", async () => {
  vi.mocked(apiBlob).mockRejectedValue(
    new ApiError(413, "REPORT_EXPORT_TOO_LARGE", "Too many rows"),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(
    await screen.findByText(/Narrow the report filters/),
  ).toHaveTextContent("100,000");
});

it("keeps the newer result when an old filter request resolves late", async () => {
  let resolveOld!: (result: ReturnType<typeof envelope>) => void;
  let oldSignal: AbortSignal | undefined;
  vi.mocked(api)
    .mockImplementationOnce((_path, options) => {
      oldSignal = options?.signal ?? undefined;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    })
    .mockResolvedValueOnce(envelope([payment({ customerName: "New result" })]));
  const view = mount();
  await waitFor(() => expect(api).toHaveBeenCalledOnce());
  searchParams = new URLSearchParams("q=New");
  view.refresh();
  await screen.findByText("New result");
  expect(oldSignal?.aborted).toBe(true);
  await act(async () =>
    resolveOld(envelope([payment({ customerName: "Old result" })])),
  );
  expect(screen.getByText("New result")).toBeInTheDocument();
  expect(screen.queryByText("Old result")).not.toBeInTheDocument();
});

it("debounces server search, trims it and resets pagination", async () => {
  searchParams = new URLSearchParams("page=3");
  mount();
  const input = screen.getByPlaceholderText("Search this report…");
  expect(input).toHaveAttribute("maxlength", "200");
  fireEvent.change(input, { target: { value: " T " } });
  fireEvent.change(input, { target: { value: " Test12 " } });
  expect(replace).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(
      "/reports/payments-received?q=Test12",
      { scroll: false },
    ),
  );
  expect(replace).toHaveBeenCalledOnce();
});

it.each([401, 403, 404, 422])(
  "handles API error %s without falling back to receipts",
  async (status) => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(status, "ERROR", "Report could not load"),
    );
    mount();
    await screen.findByText("Report could not load", {}, { timeout: 3000 });
    if (status === 401)
      expect(replace).toHaveBeenCalledWith(
        "/login?returnTo=%2Freports%2Fpayments-received",
      );
    if (status === 404)
      expect(
        screen.getByText(/unavailable on this backend/),
      ).toBeInTheDocument();
    expect(
      vi
        .mocked(api)
        .mock.calls.every(([path]) => path.startsWith("/reports/payments?")),
    ).toBe(true);
  },
);

it("keeps pagination available on an empty page and blocks invalid date ranges", async () => {
  vi.mocked(api).mockResolvedValue({
    ...envelope([]),
    pagination: { page: 10, pageSize: 25, total: 130 },
  });
  const view = mount();
  await screen.findByText("No payment results");
  expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  searchParams = new URLSearchParams("from=2026-10-08&to=2026-10-07");
  view.refresh();
  expect(screen.getByRole("alert")).toHaveTextContent("end date");
  expect(api).toHaveBeenCalledOnce();
});

it("omits invalid all/status values and trims URL search", () => {
  expect(
    paymentReportParams({
      source: "ALL",
      gatewayStatus: "PENDING",
      status: "CONFIRMED",
      q: "   ",
    }),
  ).toEqual({ page: "1", pageSize: "25" });
  expect(paymentReportParams({ q: "a".repeat(201) }).q).toHaveLength(200);
  expect(paymentReportParams({ pageSize: "10" }).pageSize).toBe("10");
});

it("opens review by internal order UUID while retaining report filters and showing recorded refunds separately", async () => {
  vi.spyOn(paymentReviewApi, "inspect").mockResolvedValue({
    data: reviewExamples.applicablePayment.data as PaymentReviewCase,
  });
  vi.mocked(api).mockResolvedValue({
    ...envelope(),
    summary: { ...summary, recordedExternalRefundAmount: "6000.00" },
  });
  searchParams = new URLSearchParams("gatewayStatus=REFUNDED&page=3");
  mount();
  await screen.findByText("Example Customer");
  expect(screen.getByLabelText("Gateway status")).toHaveValue("REFUNDED");
  expect(
    screen.getAllByRole("region", { name: "Report summary" })[0],
  ).toHaveTextContent("₹6,000.00");
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await screen.findByText("Current invoice balance");
  expect(paymentReviewApi.inspect).toHaveBeenCalledWith(
    "order-1",
    expect.any(AbortSignal),
  );
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByText(/Inspection only/)).toBeInTheDocument();
});

it("includes paid orders requiring review and keeps that filter in export", async () => {
  searchParams = new URLSearchParams(
    "needsReview=true&gatewayStatus=PAID&page=3",
  );
  vi.mocked(api).mockResolvedValue(
    envelope([payment({ gatewayStatus: "PAID", needsReview: true })]),
  );
  vi.mocked(apiBlob).mockResolvedValue({
    blob: new Blob(["id"], { type: "text/csv" }),
    disposition: 'attachment; filename="review.csv"',
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:review"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  mount();
  await screen.findByText("Example Customer");
  expect(screen.getByText("Requires review")).toBeInTheDocument();
  const request = vi
    .mocked(api)
    .mock.calls.find(([path]) => path.startsWith("/reports/payments?"))![0];
  expect(new URL(request, "http://test").searchParams.get("needsReview")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(apiBlob).toHaveBeenCalledOnce());
  const exported = new URL(vi.mocked(apiBlob).mock.calls[0][0], "http://test");
  expect(exported.searchParams.get("needsReview")).toBe("true");
  expect(exported.searchParams.has("page")).toBe(false);
  expect(exported.searchParams.get("gatewayStatus")).toBe("PAID");
});
it("review shortcut clears narrow gateway and receipt states and resets the page", async () => {
  searchParams = new URLSearchParams(
    "gatewayStatus=READY&receiptStatus=REVERSED&page=5",
  );
  mount();
  await screen.findByText("Example Customer");
  fireEvent.click(
    screen.getByRole("button", { name: "Payments requiring review" }),
  );
  const target = new URL(replace.mock.calls.at(-1)![0], "http://test");
  expect(target.searchParams.get("needsReview")).toBe("true");
  expect(target.searchParams.get("source")).toBe("GATEWAY");
  expect(target.searchParams.has("gatewayStatus")).toBe(false);
  expect(target.searchParams.has("receiptStatus")).toBe(false);
  expect(target.searchParams.has("page")).toBe(false);
  expect(paymentReportParams({ needsReview: "false" })).not.toHaveProperty(
    "needsReview",
  );
  expect(paymentReportParams({ needsReview: "invalid" })).not.toHaveProperty(
    "needsReview",
  );
});
