// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, getCollection, getResource } from "@/lib/api/client";
import { InvoiceRegisterPage } from "./invoice-register-page";

const replace = vi.hoisted(() => vi.fn());
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/invoices",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    api: vi.fn(),
    getCollection: vi.fn(),
    getResource: vi.fn(),
    apiBlob: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  document.body.classList.remove("report-printing");
});

describe("Invoice Register", () => {
  it("renders the server summary instead of summing the loaded page", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.mocked(getCollection).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
    });
    vi.mocked(api).mockResolvedValue({
      data: [
        {
          invoiceId: "invoice-1",
          invoiceDate: "2026-09-01",
          financialYear: "2627",
          invoiceNumber: "ER/2627/1",
          status: "ISSUED",
          companyId: "company-1",
          companyName: "Eastern Risen",
          customerId: "customer-1",
          customerName: "Acme Travel",
          customerCategory: "AGENT",
          serviceCategoryId: "service-1",
          serviceCategoryName: "Tours",
          vehicleId: null,
          vehicleRegistrationNumber: null,
          vehicleName: null,
          vehicleType: null,
          guestDisplayText: "Group",
          dueDate: null,
          subtotal: "8.00",
          taxTotal: "2.00",
          grandTotal: "10.00",
          receivedAmount: "0.00",
          adjustmentAmount: "0.00",
          dueAmount: "10.00",
          paymentStatus: "UNPAID",
          issuedAt: "2026-09-01T00:00:00Z",
          cancelledAt: null,
          cancellationReason: null,
        },
      ],
      summary: {
        total: 50,
        draftCount: 2,
        issuedCount: 47,
        cancelledCount: 1,
        subtotal: "84744.92",
        taxTotal: "15254.08",
        grandTotal: "99999.00",
        receivedAmount: "40000.00",
        adjustmentAmount: "5000.00",
        dueAmount: "54999.00",
      },
      pagination: { page: 1, pageSize: 25, total: 50 },
      meta: {
        currency: "INR",
        dateBasis: "INVOICE_DATE",
        from: "2026-04-01",
        to: "2027-03-31",
        balanceBasis: "CURRENT",
        generatedAt: "2026-09-11T10:00:00Z",
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <InvoiceRegisterPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("₹99,999.00")).toBeInTheDocument();
    expect(screen.getAllByText("₹10.00")).toHaveLength(2);
    expect(
      screen.getByText("47 issued · 2 drafts · 1 cancelled"),
    ).toBeInTheDocument();
    const printButton = screen.getByRole("button", {
      name: "Print Invoice Register",
    });
    fireEvent.click(printButton);
    expect(printButton).toBeDisabled();
    expect(printButton).toHaveAttribute("aria-busy", "true");
    const printView = document.body.querySelector(".print-report");
    expect(printView).not.toBeNull();
    expect(printView).toHaveTextContent("Invoice Register");
    expect(printView).toHaveTextContent("Current page · rows 1–25 of 50");
    expect(printView).toHaveTextContent("CurrencyINR");
    expect(printView).toHaveTextContent("Full filtered report totals");
    expect(printView).toHaveTextContent("Grand Total₹99,999.00");
    expect(printView).toHaveTextContent("Invoice Number");
    expect(printView).toHaveTextContent("Cancellation Reason");
    expect(
      Array.from(printView!.querySelectorAll("th"), (cell) => cell.textContent),
    ).toEqual([
      "Invoice Date",
      "Financial Year",
      "Invoice Number",
      "Invoice Status",
      "Company",
      "Customer",
      "Customer Category",
      "Service Category",
      "Vehicle Registration Number",
      "Vehicle Name",
      "Vehicle Type",
      "Guest",
      "Due Date",
      "Subtotal",
      "Tax Total",
      "Grand Total",
      "Received Amount",
      "Settlement Discount",
      "Due Amount",
      "Payment Status",
      "Cancellation Reason",
    ]);
    expect(printView).toHaveTextContent("Group");
    expect(printView).not.toHaveTextContent("invoice-1");
    expect(printView).not.toHaveTextContent("company-1");
    expect(printView).not.toHaveTextContent("customer-1");
    expect(printView).not.toHaveTextContent("service-1");
    expect(printView).not.toHaveTextContent("2026-09-01T00:00:00Z");
    expect(print).toHaveBeenCalledOnce();
    expect(document.body).toHaveClass("report-printing");
    fireEvent(window, new Event("afterprint"));
    await waitFor(() => {
      expect(document.body.querySelector(".print-report")).toBeNull();
      expect(document.body).not.toHaveClass("report-printing");
    });
    fireEvent.click(screen.getByRole("button", { name: /Grand total/ }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/reports/invoices?sortBy=grandTotal&sortOrder=asc",
        { scroll: false },
      ),
    );
  });

  it("carries business filters and server sorting into the print view", async () => {
    searchParams = new URLSearchParams({
      from: "2026-08-01",
      to: "2026-08-31",
      customerCategory: "CORPORATE",
      status: "ISSUED",
      companyId: "company-internal-id",
      sortBy: "invoiceDate",
      sortOrder: "desc",
      page: "2",
      pageSize: "25",
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.mocked(getCollection).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
    });
    vi.mocked(getResource).mockResolvedValue({
      data: {
        id: "company-internal-id",
        name: "Eastern Risen Pvt Ltd",
        status: "ACTIVE",
        version: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    });
    vi.mocked(api).mockResolvedValue({
      data: [],
      summary: {
        total: 60,
        draftCount: 0,
        issuedCount: 60,
        cancelledCount: 0,
        subtotal: "100.00",
        taxTotal: "18.00",
        grandTotal: "118.00",
        receivedAmount: "18.00",
        adjustmentAmount: "0.00",
        dueAmount: "100.00",
      },
      pagination: { page: 2, pageSize: 25, total: 60 },
      meta: {
        currency: "INR",
        dateBasis: "INVOICE_DATE",
        from: "2026-08-01",
        to: "2026-08-31",
        balanceBasis: "CURRENT",
        generatedAt: "2026-09-11T10:00:00Z",
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <InvoiceRegisterPage />
      </QueryClientProvider>,
    );
    const button = await screen.findByRole("button", {
      name: "Print Invoice Register",
    });
    fireEvent.click(button);
    const printView = document.body.querySelector(".print-report");
    expect(printView).toHaveTextContent(
      "Selected date range2026-08-01 to 2026-08-31",
    );
    expect(printView).toHaveTextContent("Customer category: Corporate");
    await waitFor(() =>
      expect(printView).toHaveTextContent("Company: Eastern Risen Pvt Ltd"),
    );
    expect(printView).not.toHaveTextContent("company-internal-id");
    expect(printView).toHaveTextContent("Invoice status: Issued");
    expect(printView).toHaveTextContent(
      "Server sort: Invoice date (descending)",
    );
    expect(printView).toHaveTextContent("Current page · rows 26–50 of 60");
    expect(vi.mocked(api).mock.calls[0][0]).toContain("sortBy=invoiceDate");
    expect(vi.mocked(api).mock.calls[0][0]).toContain("sortOrder=desc");
  });

  it("hides printing when report access is not authorized", async () => {
    vi.mocked(getCollection).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
    });
    vi.mocked(api).mockResolvedValue({
      data: [],
      summary: {
        total: 0,
        draftCount: 0,
        issuedCount: 0,
        cancelledCount: 0,
        subtotal: "0.00",
        taxTotal: "0.00",
        grandTotal: "0.00",
        receivedAmount: "0.00",
        adjustmentAmount: "0.00",
        dueAmount: "0.00",
      },
      pagination: { page: 1, pageSize: 25, total: 0 },
      meta: {
        currency: "INR",
        dateBasis: "INVOICE_DATE",
        from: null,
        to: null,
        balanceBasis: "CURRENT",
        generatedAt: "2026-09-11T10:00:00Z",
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <InvoiceRegisterPage canPrint={false} />
      </QueryClientProvider>,
    );
    await screen.findByText("No invoice results");
    expect(
      screen.getByRole("button", { name: "Export CSV" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Print Invoice Register/ }),
    ).not.toBeInTheDocument();
  });

  it("puts category filters and allow-listed sorting in the URL and resets page", async () => {
    vi.mocked(getCollection).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
    });
    vi.mocked(api).mockResolvedValue({
      data: [],
      summary: {
        total: 0,
        draftCount: 0,
        issuedCount: 0,
        cancelledCount: 0,
        subtotal: "0.00",
        taxTotal: "0.00",
        grandTotal: "0.00",
        receivedAmount: "0.00",
        adjustmentAmount: "0.00",
        dueAmount: "0.00",
      },
      pagination: { page: 1, pageSize: 25, total: 0 },
      meta: {
        currency: "INR",
        dateBasis: "INVOICE_DATE",
        from: null,
        to: null,
        balanceBasis: "CURRENT",
        generatedAt: "2026-09-11T10:00:00Z",
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <InvoiceRegisterPage />
      </QueryClientProvider>,
    );
    await screen.findByText("No invoice results");
    fireEvent.change(screen.getByLabelText("Customer category"), {
      target: { value: "CORPORATE" },
    });
    expect(replace).toHaveBeenCalledWith(
      "/reports/invoices?customerCategory=CORPORATE",
      { scroll: false },
    );
  });
});
