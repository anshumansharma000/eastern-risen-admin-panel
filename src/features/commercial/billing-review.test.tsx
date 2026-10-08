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
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { commercialApi } from "./api";
import { BillingReviewPanel } from "./billing-review";
import {
  billingBooking,
  acceptedQuote,
  eligibleReview,
  invoiceDetails,
} from "./billing-fixtures.test-helper";
vi.mock("./api", () => ({
  commercialApi: {
    billingReview: vi.fn(),
    enablePayment: vi.fn(),
    picker: vi.fn(),
  },
}));
vi.mock("@/lib/api/client", async (original) => {
  const actual = await original<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      data: [],
      pagination: { page: 1, pageSize: 100, total: 0 },
    })),
    getResource: vi.fn(async () => ({
      data: { name: "Actual master", requiresVehicle: false },
    })),
  };
});
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(commercialApi.billingReview).mockResolvedValue({
    data: eligibleReview,
  });
  vi.mocked(commercialApi.picker).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 100, total: 0 },
  });
});
function show() {
  const enabled = vi.fn().mockResolvedValue(undefined),
    refresh = vi.fn().mockResolvedValue(undefined),
    close = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <BillingReviewPanel
        booking={billingBooking}
        quote={acceptedQuote}
        onEnabled={enabled}
        onRefresh={refresh}
        onClose={close}
      />
    </QueryClientProvider>,
  );
  return { enabled, refresh, close };
}
async function review() {
  await screen.findByText("Accepted quote · Version 2");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review invoice details" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Review invoice details" }),
  );
  await screen.findByText(/Review complete/);
}
it("requires review of exact invoice-only details, preserves optional presence, and enables only once", async () => {
  let resolve!: (value: never) => void;
  vi.mocked(commercialApi.enablePayment).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { enabled } = show();
  await screen.findByText("Accepted quote · Version 2");
  expect(screen.getByRole("button", { name: "Enable payment" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Enable payment" }),
  ).toHaveAccessibleDescription(/After filling or changing invoice details/);
  fireEvent.change(screen.getByLabelText("Internal label"), {
    target: { value: "Special group" },
  });
  await review();
  expect(
    screen.queryByText(/After filling or changing invoice details/),
  ).not.toBeInTheDocument();
  expect(commercialApi.billingReview).toHaveBeenLastCalledWith("booking", {
    ...invoiceDetails,
    label: "Special group",
  });
  const action = screen.getByRole("button", { name: "Enable payment" });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(commercialApi.enablePayment).toHaveBeenCalledTimes(1);
  expect(commercialApi.enablePayment).toHaveBeenCalledWith("booking", {
    quoteId: "quote",
    reviewToken: "opaque-review-token",
    invoiceDetails: { ...invoiceDetails, label: "Special group" },
  });
  expect(
    vi.mocked(commercialApi.enablePayment).mock.calls[0][1].invoiceDetails,
  ).not.toHaveProperty("lines");
  await act(async () => resolve({ data: {} } as never));
  expect(enabled).toHaveBeenCalled();
});
it("invalidates eligible tokens on edits and ignores delayed stale review responses", async () => {
  show();
  await review();
  fireEvent.change(screen.getByLabelText("Traveller / group display text"), {
    target: { value: "Changed group" },
  });
  expect(screen.getByRole("button", { name: "Enable payment" })).toBeDisabled();
  let resolve!: (value: { data: typeof eligibleReview }) => void;
  vi.mocked(commercialApi.billingReview).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Review invoice details" }),
  );
  fireEvent.change(screen.getByLabelText("Service provided at"), {
    target: { value: "New place" },
  });
  await act(async () => resolve({ data: eligibleReview }));
  expect(screen.getByRole("button", { name: "Enable payment" })).toBeDisabled();
});
it("renders missing fields and errors from an ineligible successful review", async () => {
  vi.mocked(commercialApi.billingReview).mockResolvedValue({
    data: {
      ...eligibleReview,
      eligible: false,
      reviewToken: null,
      missingFields: ["guestDisplayText"],
      errors: [
        {
          code: "CORE_VALIDATION_FAILED",
          message: "Provide a real traveller name",
        },
      ],
    },
  });
  show();
  expect(
    await screen.findByText("Provide a real traveller name"),
  ).toBeInTheDocument();
  expect(screen.getByText(/Required: Traveller/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable payment" })).toBeDisabled();
});
it("preserves overdue accepted dates and omits optional invoice due date", async () => {
  show();
  await review();
  expect(screen.getByText(/Past agreed due date/)).toHaveTextContent(
    "2020-01-01",
  );
  expect(screen.getByLabelText("Invoice due date (optional)")).toHaveValue("");
  expect(
    vi.mocked(commercialApi.billingReview).mock.calls.at(-1)?.[1],
  ).not.toHaveProperty("dueDate");
});
it("keeps an uncertain request unchanged for retries and locks details", async () => {
  vi.mocked(commercialApi.enablePayment)
    .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Response lost"))
    .mockResolvedValueOnce({ data: {} } as never);
  const { refresh } = show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Enable payment" }));
  const retry = await screen.findByRole("button", {
    name: "Retry same payment enablement",
  });
  expect(screen.getByLabelText("Invoice date")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close review" })).toBeDisabled();
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await waitFor(() =>
    expect(commercialApi.enablePayment).toHaveBeenCalledTimes(2),
  );
  expect(vi.mocked(commercialApi.enablePayment).mock.calls[1][1]).toEqual(
    vi.mocked(commercialApi.enablePayment).mock.calls[0][1],
  );
  expect(commercialApi.billingReview).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalled();
});
it("requires explicit fresh review after stale-review conflicts", async () => {
  vi.mocked(commercialApi.enablePayment).mockRejectedValue(
    new ApiError(409, "STALE_BILLING_REVIEW", "Review changed"),
  );
  const { refresh } = show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Enable payment" }));
  await screen.findByText(/Booking or billing details changed/);
  expect(screen.getByRole("button", { name: "Enable payment" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Retry same payment enablement" }),
  ).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});

it("allows an explicitly empty bank selection when the initial review has no invoice details", async () => {
  vi.mocked(commercialApi.billingReview).mockResolvedValueOnce({
    data: {
      ...eligibleReview,
      invoiceFields: {
        companyId: "company",
        customerId: "customer",
        serviceCategoryId: "category",
        lines: eligibleReview.invoiceFields.lines,
      },
      eligible: false,
      reviewToken: null,
      missingFields: ["invoiceDate", "guestDisplayText", "bankAccountIds"],
    },
  });
  show();
  await screen.findByText("Accepted quote · Version 2");
  fireEvent.change(screen.getByLabelText("Invoice date"), {
    target: { value: invoiceDetails.invoiceDate },
  });
  fireEvent.change(screen.getByLabelText("Traveller / group display text"), {
    target: { value: invoiceDetails.guestDisplayText },
  });
  fireEvent.change(screen.getByLabelText("Service provided at"), {
    target: { value: invoiceDetails.serviceProvidedAt },
  });
  fireEvent.change(screen.getByLabelText("Place of supply — state"), {
    target: { value: invoiceDetails.placeOfSupplyState },
  });
  fireEvent.change(screen.getByLabelText("Place of supply — country"), {
    target: { value: invoiceDetails.placeOfSupplyCountry },
  });
  await review();
  expect(commercialApi.billingReview).toHaveBeenLastCalledWith(
    "booking",
    invoiceDetails,
  );
});
it("rejects an initial review for a different quote instead of showing mismatched terms", async () => {
  vi.mocked(commercialApi.billingReview).mockResolvedValue({
    data: { ...eligibleReview, quoteId: "new-quote", quoteVersion: 3 },
  });
  show();
  expect(
    await screen.findByText(
      "The accepted quote changed. Reload the booking and review its current terms.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Accepted quote · Version 3"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable payment" })).toBeDisabled();
});
