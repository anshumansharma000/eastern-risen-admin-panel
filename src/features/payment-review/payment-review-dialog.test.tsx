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
import { ApiError } from "@/lib/api/client";
import type { CoreRole } from "@/lib/api/contracts";
import { paymentReviewApi } from "./api";
import type { PaymentResolution, PaymentReviewCase } from "./contracts";
import { PaymentReviewDialog } from "./payment-review-dialog";
import examples from "./review-fixtures.test-helper.json";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/payments-received",
  useRouter: () => ({ replace }),
}));
vi.mock("./api", () => ({
  paymentReviewApi: { inspect: vi.fn(), resolve: vi.fn(), reconcile: vi.fn() },
}));
const close = vi.fn();
function fixture(
  name: keyof typeof examples = "applicablePayment",
): PaymentReviewCase {
  return structuredClone(examples[name].data) as PaymentReviewCase;
}
function applicable() {
  const value = fixture();
  value.attempts = [value.attempts[0]];
  value.history = [];
  return value;
}
function resolution(
  value: PaymentReviewCase,
  action: PaymentResolution["action"] = "APPLY_TO_LINKED_INVOICE",
): PaymentResolution {
  return {
    id: "resolution-1",
    attemptId: value.attempts[0].id,
    orderId: value.order.id,
    action,
    actorId: "admin-1",
    note: "Reviewed evidence",
    receiptId: "receipt-1",
    amount: value.attempts[0].amount,
    currency: value.attempts[0].currency,
    provider: value.order.provider,
    providerRefundReference: null,
    refund: null,
    before: {},
    after: {},
    createdAt: "2026-10-07T13:00:00Z",
  };
}
function resolved(value: PaymentReviewCase) {
  const result = structuredClone(value);
  const record = resolution(value);
  result.version = "new-version";
  result.order.gatewayStatus = "PAID";
  result.attempts[0].accountingStatus = "APPLIED";
  result.attempts[0].resolution = record;
  result.attempts[0].actions.forEach((action) => {
    action.allowed = false;
    action.blockers = ["ALREADY_RESOLVED"];
  });
  result.history = [record];
  return { data: { resolution: record, review: result } };
}
function mount(role: CoreRole = "CORE_ADMIN") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidation = vi.spyOn(cache, "invalidateQueries");
  render(
    <QueryClientProvider client={cache}>
      <PaymentReviewDialog orderId="order-uuid" role={role} onClose={close} />
    </QueryClientProvider>,
  );
  return { cache, invalidation };
}
function actionButton(name = "Apply to linked invoice") {
  return screen
    .getAllByRole("button", { name })
    .find((button) => !(button as HTMLButtonElement).disabled)!;
}
function confirmDecision() {
  fireEvent.change(screen.getByLabelText("Staff note"), {
    target: { value: "Reviewed evidence" },
  });
  fireEvent.click(screen.getByLabelText(/I confirm payment/));
}
beforeEach(() => {
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: applicable() });
  vi.mocked(paymentReviewApi.resolve).mockResolvedValue(resolved(applicable()));
  vi.mocked(paymentReviewApi.reconcile).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it.each(["CORE_DATA_ENTRY", "CORE_REPORT_VIEWER"] as const)(
  "allows %s to inspect but never resolve",
  async (role) => {
    mount(role);
    await screen.findByText("Current invoice balance");
    expect(screen.getByText(/Inspection only/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply to linked invoice" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Staff note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check provider status" }) !== null,
    ).toBe(role === "CORE_DATA_ENTRY");
    expect(paymentReviewApi.resolve).not.toHaveBeenCalled();
    expect(paymentReviewApi.inspect).toHaveBeenCalledWith(
      "order-uuid",
      expect.any(AbortSignal),
    );
  },
);

it("separates unknown historical reasons from current backend action blockers", async () => {
  const value = fixture("ineligibleInvoice");
  value.attempts[0].reviewReasons = [
    { code: "UNKNOWN_LEGACY_REASON", details: {} },
  ];
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  mount();
  await screen.findByText("The original reason was not recorded.");
  expect(
    screen.getAllByText("The current invoice is not issued."),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Apply to linked invoice" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Record a completed external refund" }),
  ).toBeEnabled();
});

it("records an explicitly confirmed decision and refreshes authoritative financial data", async () => {
  const { invalidation } = mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton());
  const submit = screen.getByRole("button", {
    name: "Record confirmed decision",
  });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Staff note"), {
    target: { value: "Reviewed evidence" },
  });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I confirm payment/));
  fireEvent.click(submit);
  await screen.findByText(/Decision recorded/);
  expect(paymentReviewApi.resolve).toHaveBeenCalledWith(
    applicable().attempts[0].id,
    {
      action: "APPLY_TO_LINKED_INVOICE",
      version: applicable().version,
      note: "Reviewed evidence",
    },
    expect.any(String),
  );
  expect(screen.getByText(/recorded by admin-1/)).toBeInTheDocument();
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ["report"] });
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ["invoice"] });
  expect(invalidation).toHaveBeenCalledWith({
    queryKey: ["commercial-booking"],
  });
});

it("selects only backend matching receipts and shows authoritative evidence", async () => {
  const value = applicable();
  const candidate = fixture("additionalSuccessfulPayment").attempts[1]
    .matchingReceipts[0];
  value.attempts[0].matchingReceipts = [candidate];
  value.attempts[0].actions.find(
    (action) => action.action === "LINK_EXISTING_RECEIPT",
  )!.allowed = true;
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton("Link existing receipt"));
  const select = screen.getByLabelText("Matching receipt");
  expect(within(select).getAllByRole("option")).toHaveLength(2);
  fireEvent.change(select, { target: { value: candidate.id } });
  expect(
    screen.getByText(/BACKEND_GATEWAY_RECEIPT_IDENTITY/),
  ).toBeInTheDocument();
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await waitFor(() => expect(paymentReviewApi.resolve).toHaveBeenCalledOnce());
  expect(vi.mocked(paymentReviewApi.resolve).mock.calls[0][1]).toEqual({
    action: "LINK_EXISTING_RECEIPT",
    version: value.version,
    note: "Reviewed evidence",
    receiptId: candidate.id,
  });
});

it("requires unchecked refund attestation and records only the exact full amount with an India-time timestamp", async () => {
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton("Record a completed external refund"));
  const attestation = screen.getByLabelText(/I attest as an administrator/);
  expect(attestation).not.toBeChecked();
  expect(screen.getByLabelText("Full refund amount and currency")).toHaveValue(
    "10.00 INR",
  );
  expect(
    screen.getByLabelText("Full refund amount and currency"),
  ).toHaveAttribute("readonly");
  fireEvent.change(screen.getByLabelText("Provider refund reference"), {
    target: { value: "refund-1" },
  });
  fireEvent.change(screen.getByLabelText(/Documentary evidence reference/), {
    target: { value: "Statement-1" },
  });
  fireEvent.change(screen.getByLabelText("Refund completed at (India time)"), {
    target: { value: "2026-10-07T12:30" },
  });
  confirmDecision();
  expect(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  ).toBeDisabled();
  fireEvent.click(attestation);
  expect(screen.getByLabelText(/I confirm payment/)).not.toBeChecked();
  fireEvent.click(screen.getByLabelText(/I confirm payment/));
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await waitFor(() => expect(paymentReviewApi.resolve).toHaveBeenCalledOnce());
  expect(vi.mocked(paymentReviewApi.resolve).mock.calls[0][1]).toEqual({
    action: "RECORD_VERIFIED_EXTERNAL_REFUND",
    version: applicable().version,
    note: "Reviewed evidence",
    refund: {
      providerRefundReference: "refund-1",
      amount: "10.00",
      currency: "INR",
      completedAt: "2026-10-07T07:00:00.000Z",
      verification: {
        kind: "STAFF_ATTESTATION",
        evidenceReference: "Statement-1",
        attested: true,
      },
    },
  });
});

it("locks an uncertain decision, prevents duplicate clicks and retries the exact original body and key", async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(paymentReviewApi.resolve)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    )
    .mockResolvedValueOnce(resolved(applicable()));
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton());
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Recording…" }));
  expect(paymentReviewApi.resolve).toHaveBeenCalledOnce();
  await act(async () =>
    reject(new ApiError(0, "NETWORK_ERROR", "Connection lost")),
  );
  await screen.findByText(/The outcome is uncertain/);
  expect(screen.getByLabelText("Staff note")).toBeDisabled();
  expect(
    screen.getByRole("link", { name: applicable().booking!.reference }),
  ).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(close).not.toHaveBeenCalled();
  const firstCall = vi.mocked(paymentReviewApi.resolve).mock.calls[0];
  fireEvent.click(
    screen.getByRole("button", { name: "Retry exact captured decision" }),
  );
  await screen.findByText(/Decision recorded/);
  expect(vi.mocked(paymentReviewApi.resolve).mock.calls[1]).toEqual(firstCall);
});

it("refetches stale cases and requires a fresh human decision and confirmation", async () => {
  const changed = applicable();
  changed.version = "changed-version";
  vi.mocked(paymentReviewApi.inspect)
    .mockResolvedValueOnce({ data: applicable() })
    .mockResolvedValue({ data: changed });
  vi.mocked(paymentReviewApi.resolve).mockRejectedValueOnce(
    new ApiError(409, "PAYMENT_REVIEW_STALE", "Case changed"),
  );
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton());
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await screen.findByText(/Select an action and confirm a new decision/);
  await waitFor(() =>
    expect(paymentReviewApi.inspect).toHaveBeenCalledTimes(2),
  );
  expect(screen.queryByLabelText(/I confirm payment/)).not.toBeInTheDocument();
  fireEvent.click(actionButton());
  expect(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  ).toBeDisabled();
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await screen.findByText(/Decision recorded/);
  const calls = vi.mocked(paymentReviewApi.resolve).mock.calls;
  expect(calls[1][1].version).toBe("changed-version");
  expect(calls[1][2]).not.toBe(calls[0][2]);
});

it("holds idempotency conflicts without silently changing or retrying the decision", async () => {
  vi.mocked(paymentReviewApi.resolve).mockRejectedValue(
    new ApiError(
      409,
      "PAYMENT_RESOLUTION_IDEMPOTENCY_CONFLICT",
      "Conflicting key",
    ),
  );
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton());
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await screen.findByText(/captured decision is locked/);
  expect(
    screen.queryByRole("button", { name: "Retry exact captured decision" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Staff note")).toBeDisabled();
  expect(paymentReviewApi.resolve).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Start a new decision/ }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: /Start a new decision/ }));
  expect(screen.queryByLabelText(/I confirm payment/)).not.toBeInTheDocument();
});

it("shows existing resolution history when another administrator already resolved the attempt", async () => {
  vi.mocked(paymentReviewApi.inspect)
    .mockResolvedValueOnce({ data: applicable() })
    .mockResolvedValue({ data: resolved(applicable()).data.review });
  vi.mocked(paymentReviewApi.resolve).mockRejectedValue(
    new ApiError(409, "PAYMENT_ALREADY_RESOLVED", "Already resolved"),
  );
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton());
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await screen.findByText(/recorded by admin-1/);
  expect(
    screen.getByRole("button", { name: "Apply to linked invoice" }),
  ).toBeDisabled();
  expect(screen.queryByLabelText(/I confirm payment/)).not.toBeInTheDocument();
});

it("keeps additional unresolved funds visible after resolving a different attempt", async () => {
  const value = applicable();
  const extra = fixture("additionalSuccessfulPayment").attempts[0];
  value.attempts.push(extra);
  const response = resolved(value);
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  vi.mocked(paymentReviewApi.resolve).mockResolvedValue(response);
  mount();
  await screen.findByText("Current invoice balance");
  fireEvent.click(actionButton());
  confirmDecision();
  fireEvent.click(
    screen.getByRole("button", { name: "Record confirmed decision" }),
  );
  await screen.findByText(/Decision recorded/);
  const remaining = screen.getByRole("region", {
    name: `Payment attempt ${extra.providerPaymentId}`,
  });
  expect(remaining).toHaveTextContent("REVIEW REQUIRED");
  expect(remaining).toHaveTextContent(
    "An additional successful payment was received.",
  );
  expect(
    within(remaining).getByRole("button", { name: "Apply to linked invoice" }),
  ).toBeDisabled();
});

it("exposes reversed-without-refund cases without inferring a refund or allowing a second terminal decision", async () => {
  const value = resolved(applicable()).data.review;
  value.attempts[0].receiptAccountingState = "REVERSED_WITHOUT_REFUND";
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  mount();
  await screen.findByText(/successful payment remains unresolved/);
  expect(
    screen.getByRole("button", { name: "Apply to linked invoice" }),
  ).toBeDisabled();
  expect(screen.getByText(/separate accounting amendment/)).toBeInTheDocument();
});

it("checks the provider by UUID and refetches the case without resolving any attempt", async () => {
  mount("CORE_DATA_ENTRY");
  await screen.findByText("Current invoice balance");
  fireEvent.click(
    screen.getByRole("button", { name: "Check provider status" }),
  );
  await screen.findByText(/Provider status checked/);
  expect(paymentReviewApi.reconcile).toHaveBeenCalledWith("order-uuid");
  expect(paymentReviewApi.inspect).toHaveBeenCalledTimes(2);
  expect(paymentReviewApi.resolve).not.toHaveBeenCalled();
});

it("shows staff-attested refund history separately from a successful provider payment", async () => {
  const value = fixture();
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  mount();
  await screen.findByText("Current invoice balance");
  const refunded = value.attempts.find(
    (attempt) => attempt.accountingStatus === "REFUNDED",
  )!;
  const region = screen.getByRole("region", {
    name: `Payment attempt ${refunded.providerPaymentId}`,
  });
  expect(region).toHaveTextContent("SUCCESS");
  expect(region).toHaveTextContent("REFUNDED");
  expect(
    screen.getByText(/not independently verified with the provider/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      refunded.resolution!.refund!.verification.evidenceReference,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/recorded by.*d1125ba2/)).toBeInTheDocument();
});

it("keeps foreign-currency amounts visible and respects backend blockers for INR accounting", async () => {
  const value = applicable();
  value.attempts[0].currency = "USD";
  value.attempts[0].reviewReasons = [
    { code: "CURRENCY_MISMATCH", details: { expected: "INR", actual: "USD" } },
  ];
  for (const action of value.attempts[0].actions) {
    if (action.action !== "RECORD_VERIFIED_EXTERNAL_REFUND") {
      action.allowed = false;
      action.blockers = ["CURRENCY_NOT_INR"];
    }
  }
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  mount();
  await screen.findByText("Current invoice balance");
  expect(
    screen.getByRole("button", { name: "Apply to linked invoice" }),
  ).toBeDisabled();
  expect(
    screen.getAllByText("Only INR payments can be applied to an INR invoice."),
  ).toHaveLength(2);
  fireEvent.click(actionButton("Record a completed external refund"));
  expect(screen.getByLabelText("Full refund amount and currency")).toHaveValue(
    "10.00 USD",
  );
});

it("shows the latest attempt first without changing backend attempt order", async () => {
  const value = fixture();
  value.attempts[0].initiatedAt = "2026-10-06T10:00:00Z";
  value.attempts[1].initiatedAt = "2026-10-07T10:00:00Z";
  const originalIds = value.attempts.map((item) => item.id);
  vi.mocked(paymentReviewApi.inspect).mockResolvedValue({ data: value });
  mount();
  await screen.findByText("Current invoice balance");
  const attempts = screen.getAllByRole("region", { name: /^Payment attempt / });
  expect(attempts[0]).toHaveAccessibleName(
    `Payment attempt ${value.attempts[1].providerPaymentId}`,
  );
  expect(within(attempts[0]).getByText(/Latest/)).toBeInTheDocument();
  expect(value.attempts.map((item) => item.id)).toEqual(originalIds);
});

it("reveals the decision within its attempt, focuses the field and restores action focus on cancel", async () => {
  const scroll = vi.fn();
  const previous = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  try {
    mount();
    await screen.findByText("Current invoice balance");
    const action = actionButton();
    fireEvent.click(action);
    const form = screen.getByRole("region", {
      name: "Confirm payment decision",
    });
    const attempt = screen.getByRole("region", { name: /^Payment attempt / });
    expect(attempt).toContainElement(form);
    expect(action).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Staff note")).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    fireEvent.click(
      within(form).getByRole("button", { name: "Cancel decision" }),
    );
    expect(
      screen.queryByRole("region", { name: "Confirm payment decision" }),
    ).not.toBeInTheDocument();
    expect(action).toHaveFocus();
    expect(action).toHaveAttribute("aria-expanded", "false");
    expect(paymentReviewApi.resolve).not.toHaveBeenCalled();
  } finally {
    if (previous)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previous);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
