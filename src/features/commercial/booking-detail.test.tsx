// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { AvailableInvoice, BookingDetail } from "./api";
import { commercialApi } from "./api";
import { acceptedQuote, calculated } from "./billing-fixtures.test-helper";
import { BookingDetailPage } from "./booking-detail";

vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return {
    ...actual,
    commercialApi: {
      ...actual.commercialApi,
      detail: vi.fn(),
      availableInvoices: vi.fn(),
      rotate: vi.fn(),
      linkInvoice: vi.fn(),
      reconcile: vi.fn(),
      schedule: vi.fn(),
    },
  };
});
const fixture: BookingDetail = {
  booking: {
    id: "b",
    reference: "R-1",
    companyId: "c",
    customerId: "u",
    serviceCategoryId: "s",
    title: "Tour",
    status: "QUOTED",
    serviceStartsOn: null,
    serviceEndsOn: null,
  },
  quotes: [
    {
      id: "q",
      version: 1,
      description: "Tour quote",
      inclusions: "",
      exclusions: "",
      terms: "Pay on time",
      total: "100.00",
      expiresOn: null,
      acceptedAt: "2026-09-28T00:00:00Z",
    },
  ],
  milestones: [],
  orders: [],
  invoice: null,
};
const availableInvoice: AvailableInvoice = {
  id: "invoice-1",
  invoiceNumber: "ER/2627/1",
  financialYear: "2026-27",
  invoiceDate: "2026-09-28",
  status: "ISSUED",
  grandTotal: "100.00",
  customerName: "Test Customer",
  guestName: "Asha Guest",
  label: "Golden Triangle tour",
  lineDescription: "Agra sightseeing",
  eligible: true,
  unavailableReasons: [],
};
const resultPage = (
  data: AvailableInvoice[],
  page = 1,
  total = data.length,
) => ({
  data,
  pagination: { page, pageSize: 25, total },
});
function show(
  data: BookingDetail = fixture,
  role: "CORE_ADMIN" | "CORE_DATA_ENTRY" | "CORE_REPORT_VIEWER" = "CORE_ADMIN",
) {
  vi.mocked(commercialApi.detail).mockResolvedValue({ data });
  return render(
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
      <BookingDetailPage id="b" role={role} />
    </QueryClientProvider>,
  );
}
async function searchInvoices(value = "ER/2627/1") {
  const search = await screen.findByRole("textbox", {
    name: "Search invoices",
  });
  fireEvent.change(search, { target: { value } });
  return search;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(commercialApi.availableInvoices).mockResolvedValue(
    resultPage([availableInvoice]),
  );
});
afterEach(() => {
  document.body.innerHTML = "";
});
describe("commercial booking detail", () => {
  it("keeps confirmation disabled until invoice and first milestone are paid", async () => {
    show();
    expect(
      await screen.findByRole("button", { name: "CONFIRMED" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Link an issued invoice first."),
    ).toBeInTheDocument();
  });
  it("marks an accepted older quote as superseded after a revision", async () => {
    show({
      ...fixture,
      quotes: [
        { ...fixture.quotes[0], id: "q2", version: 2, acceptedAt: null },
        fixture.quotes[0],
      ],
    });
    expect(
      await screen.findByText(/Acceptance: Superseded/),
    ).toBeInTheDocument();
    expect(screen.getByText("AWAITING ACCEPTANCE")).toBeInTheDocument();
    expect(
      screen.getByText(/Wait for acceptance of the latest quote/),
    ).toBeInTheDocument();
  });
  it("shows REVIEW_REQUIRED funds without claiming a refund", async () => {
    show({
      ...fixture,
      orders: [
        {
          id: "o",
          provider: "Cashfree",
          providerOrderId: "po",
          amount: "50.00",
          status: "REVIEW_REQUIRED",
          providerPaymentId: "pp",
          paidAt: null,
          receiptId: null,
        },
      ],
    });
    expect(
      await screen.findByText(/Provider-confirmed funds need staff review/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/this does not mean a refund occurred/),
    ).toBeInTheDocument();
  });
  it("shows invoice mismatch and request ID from the backend", async () => {
    vi.mocked(commercialApi.linkInvoice).mockRejectedValue(
      new ApiError(
        422,
        "INVOICE_MISMATCH",
        "Grand total does not match the quote",
        "req-123",
      ),
    );
    show();
    await searchInvoices();
    fireEvent.click(await screen.findByRole("button", { name: /ER\/2627\/1/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Link issued invoice" }),
    );
    expect(
      await screen.findByText("Grand total does not match the quote"),
    ).toBeInTheDocument();
    expect(screen.getByText("req-123")).toBeInTheDocument();
    expect(commercialApi.linkInvoice).toHaveBeenCalledWith("b", {
      invoiceNumber: "ER/2627/1",
      financialYear: "2026-27",
    });
    await waitFor(() =>
      expect(commercialApi.availableInvoices).toHaveBeenCalledTimes(2),
    );
    expect(commercialApi.detail).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "Link issued invoice" }),
    ).toBeDisabled();
  });
  it("searches invoice details after a debounce and shows the expanded result", async () => {
    show();
    const search = await screen.findByRole("textbox", {
      name: "Search invoices",
    });
    expect(
      screen.getByText("Enter a search to find invoices."),
    ).toBeInTheDocument();
    expect(commercialApi.availableInvoices).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /ER\/2627\/1/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "ER/2627/1" } });
    expect(commercialApi.availableInvoices).not.toHaveBeenCalled();
    const result = await screen.findByRole("button", { name: /ER\/2627\/1/ });
    expect(result).toHaveTextContent(
      "Customer: Test Customer · Guest: Asha Guest",
    );
    expect(result).toHaveTextContent("28 Sept 2026 · ₹100.00");
    expect(result).toHaveTextContent("Status: ISSUED");
    expect(result).toHaveTextContent("Label: Golden Triangle tour");
    expect(result).toHaveTextContent("Line: Agra sightseeing");
    fireEvent.change(search, { target: { value: "Asha Guest" } });
    expect(commercialApi.availableInvoices).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Finding available invoices/)).toBeInTheDocument();
    await waitFor(() =>
      expect(commercialApi.availableInvoices).toHaveBeenCalledWith(
        "b",
        "Asha Guest",
        1,
        25,
        expect.anything(),
      ),
    );
    fireEvent.change(search, { target: { value: "   " } });
    expect(
      screen.getByText("Enter a search to find invoices."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ER\/2627\/1/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(commercialApi.availableInvoices).toHaveBeenCalledTimes(2),
    );
  });
  it("shows ineligible invoices and their backend reasons without allowing selection", async () => {
    vi.mocked(commercialApi.availableInvoices).mockResolvedValue(
      resultPage([
        {
          ...availableInvoice,
          id: "draft",
          invoiceNumber: null,
          financialYear: null,
          status: "DRAFT",
          eligible: false,
          unavailableReasons: [
            "Invoice has not been issued",
            "Amount differs from quote",
          ],
        },
        {
          ...availableInvoice,
          id: "missing-year",
          invoiceNumber: "ER/2627/2",
          financialYear: null,
          eligible: true,
          unavailableReasons: [],
        },
        availableInvoice,
      ]),
    );
    show();
    await searchInvoices();
    const draft = await screen.findByRole("button", { name: /Draft invoice/ });
    expect(draft).toBeDisabled();
    expect(draft).toHaveTextContent("Status: DRAFT");
    expect(draft).toHaveTextContent(
      "Invoice has not been issued; Amount differs from quote",
    );
    const missingYear = screen.getByRole("button", { name: /ER\/2627\/2/ });
    expect(missingYear).toBeDisabled();
    expect(missingYear).toHaveTextContent(
      "Invoice number and financial year are required.",
    );
    expect(screen.getByRole("button", { name: /ER\/2627\/1/ })).toBeEnabled();
    expect(
      screen.queryByText("No invoices match this search."),
    ).not.toBeInTheDocument();
  });
  it("pages through older invoice matches and clears an earlier selection", async () => {
    const older = {
      ...availableInvoice,
      id: "older",
      invoiceNumber: "ER/2526/9",
      financialYear: "2025-26",
    };
    vi.mocked(commercialApi.availableInvoices).mockImplementation(
      async (_id, _q, page) =>
        resultPage(page === 2 ? [older] : [availableInvoice], page, 26),
    );
    show();
    await searchInvoices("ER");
    fireEvent.click(await screen.findByRole("button", { name: /ER\/2627\/1/ }));
    expect(
      screen.getByRole("button", { name: "Link issued invoice" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("button", { name: "Link issued invoice" }),
    ).toBeDisabled();
    expect(
      await screen.findByRole("button", { name: /ER\/2526\/9/ }),
    ).toBeInTheDocument();
    expect(commercialApi.availableInvoices).toHaveBeenCalledWith(
      "b",
      "ER",
      2,
      25,
      expect.anything(),
    );
  });
  it("omits absent label and line description while retaining guest details", async () => {
    vi.mocked(commercialApi.availableInvoices).mockResolvedValue(
      resultPage([{ ...availableInvoice, label: null, lineDescription: null }]),
    );
    show();
    await searchInvoices();
    const result = await screen.findByRole("button", { name: /ER\/2627\/1/ });
    expect(result).toHaveTextContent("Guest: Asha Guest");
    expect(result).not.toHaveTextContent("Label:");
    expect(result).not.toHaveTextContent("Line:");
  });
  it("shows empty and retryable error states", async () => {
    vi.mocked(commercialApi.availableInvoices)
      .mockRejectedValueOnce(new Error("Invoice search failed"))
      .mockResolvedValueOnce(resultPage([]));
    show();
    await searchInvoices();
    expect(
      await screen.findByText("Invoice search failed"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("No invoices match this search."),
    ).toBeInTheDocument();
  });
  it("refreshes the booking and links the resulting invoice number", async () => {
    const linked = {
      ...fixture,
      booking: { ...fixture.booking, invoiceId: availableInvoice.id },
      invoice: {
        id: availableInvoice.id,
        invoiceNumber: availableInvoice.invoiceNumber,
        status: "ISSUED",
        grandTotal: "100.00",
      } as BookingDetail["invoice"],
    };
    vi.mocked(commercialApi.linkInvoice).mockResolvedValue({ data: linked });
    show();
    await searchInvoices();
    fireEvent.click(await screen.findByRole("button", { name: /ER\/2627\/1/ }));
    vi.mocked(commercialApi.detail).mockResolvedValue({ data: linked });
    fireEvent.click(
      screen.getByRole("button", { name: "Link issued invoice" }),
    );
    expect(
      await screen.findByRole("link", { name: "ER/2627/1" }),
    ).toHaveAttribute("href", "/invoices/invoice-1");
    expect(commercialApi.detail).toHaveBeenCalledTimes(2);
    expect(commercialApi.availableInvoices).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("textbox", { name: "Search invoices" }),
    ).not.toBeInTheDocument();
  });
  it("hides the picker when a booking already has a linked invoice ID", async () => {
    show({
      ...fixture,
      booking: { ...fixture.booking, invoiceId: "invoice-1" },
    });
    await screen.findByText("Tour quote");
    expect(
      screen.queryByRole("textbox", { name: "Search invoices" }),
    ).not.toBeInTheDocument();
    expect(commercialApi.availableInvoices).not.toHaveBeenCalled();
  });
  it("warns before rotating a private link", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Rotate private link" }),
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("old customer URL"),
    );
    expect(commercialApi.rotate).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
  it("shows a new copyable link only after successful rotation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(commercialApi.rotate).mockResolvedValue({
      data: { accessToken: "new-token" },
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Rotate private link" }),
    );
    expect(
      await screen.findByRole("textbox", { name: "Private customer URL" }),
    ).toBeInTheDocument();
    expect(commercialApi.rotate).toHaveBeenCalledWith("b");
    confirm.mockRestore();
  });
  it("gives viewers no payment or link mutation controls", async () => {
    show(fixture, "CORE_REPORT_VIEWER");
    await waitFor(() =>
      expect(screen.getByText("Tour quote")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Rotate private link" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Link issued invoice" }),
    ).not.toBeInTheDocument();
  });
  it("reviews default schedule before sending an empty policy body", async () => {
    vi.mocked(commercialApi.schedule).mockResolvedValue({ data: [] });
    show({
      ...fixture,
      invoice: {
        id: "i",
        status: "ISSUED",
        grandTotal: "100.00",
      } as BookingDetail["invoice"],
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Review schedule" }),
    );
    expect(
      screen.getByText(/cannot be edited after creation/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and create schedule" }),
    );
    await waitFor(() =>
      expect(commercialApi.schedule).toHaveBeenCalledWith("b", {}),
    );
  });
  it("blocks an invalid custom schedule before review", async () => {
    show({
      ...fixture,
      invoice: {
        id: "i",
        status: "ISSUED",
        grandTotal: "100.00",
      } as BookingDetail["invoice"],
    });
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Schedule type" }),
      { target: { value: "custom" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Amount (INR)" }), {
      target: { value: "20.00" },
    });
    expect(
      screen.getByRole("button", { name: "Review schedule" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/exactly equal the invoice grand total/),
    ).toBeInTheDocument();
  });
});

it("offers combined enablement for an accepted structured quote even after expiry", async () => {
  show({ ...fixture, quotes: [acceptedQuote] });
  expect(
    await screen.findByRole("button", { name: "Review and enable payment" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("textbox", { name: "Search invoices" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Grand total ₹105.00/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CONFIRMED" })).toBeDisabled();
});
it("requires acceptance of a structured revision and gives viewers no enablement controls", async () => {
  show(
    { ...fixture, quotes: [{ ...acceptedQuote, acceptedAt: null }] },
    "CORE_REPORT_VIEWER",
  );
  await screen.findByText("AWAITING ACCEPTANCE");
  expect(
    screen.queryByRole("button", { name: "Review and enable payment" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Create new quote version" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      /Wait for acceptance of the latest quote before reviewing/,
    ),
  ).toBeInTheDocument();
});
it("retains manually linked structured billing and blocks past-date manual schedules without shifting dates", async () => {
  show({
    ...fixture,
    quotes: [acceptedQuote],
    booking: { ...fixture.booking, invoiceId: "existing" },
    invoice: {
      id: "existing",
      invoiceNumber: "ER/1",
      grandTotal: "105.00",
      status: "ISSUED",
    } as BookingDetail["invoice"],
  });
  expect(await screen.findByRole("link", { name: "ER/1" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Review and enable payment" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/manual schedule endpoint cannot create these dates/),
  ).toBeInTheDocument();
  expect(commercialApi.schedule).not.toHaveBeenCalled();
});
it("sends the exact accepted plan for a structured manually linked invoice", async () => {
  const plan = {
    ...calculated.proposedPlan,
    milestones: [
      {
        label: "Agreed initial payment",
        amount: "105.00",
        dueOn: "2099-01-01",
      },
    ],
  };
  vi.mocked(commercialApi.schedule).mockResolvedValue({ data: [] });
  show({
    ...fixture,
    quotes: [{ ...acceptedQuote, proposedPlan: plan }],
    invoice: {
      id: "existing",
      invoiceNumber: "ER/1",
      grandTotal: "105.00",
      status: "ISSUED",
    } as BookingDetail["invoice"],
  });
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Create accepted payment schedule",
    }),
  );
  await waitFor(() =>
    expect(commercialApi.schedule).toHaveBeenCalledWith("b", {
      milestones: plan.milestones,
    }),
  );
});
