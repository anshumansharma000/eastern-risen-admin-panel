// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, getCollection } from "@/lib/api/client";
import { VehicleInvoicesPage } from "./vehicle-invoices-page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/vehicle-invoices",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn(), getCollection: vi.fn(), apiBlob: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.classList.remove("report-printing");
});

function renderPage(canPrint = true) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <VehicleInvoicesPage canPrint={canPrint} />
    </QueryClientProvider>,
  );
}

describe("Vehicle-wise Invoices printing", () => {
  it("prints readable vehicle columns and full-filter totals", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.mocked(getCollection).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
    });
    vi.mocked(api).mockResolvedValue({
      data: [
        {
          vehicleId: "vehicle-internal-id",
          vehicleRegistrationNumber: "WB 01 AB 1234",
          vehicleName: null,
          vehicleType: "SUV",
          invoiceCount: 2,
          subtotal: "80.00",
          taxTotal: "20.00",
          grandTotal: "100.00",
          receivedAmount: "40.00",
          adjustmentAmount: "10.00",
          dueAmount: "50.00",
          firstInvoiceDate: "2026-08-01",
          latestInvoiceDate: "2026-08-31",
        },
      ],
      summary: {
        total: 40,
        invoiceCount: 95,
        subtotal: "8000.00",
        taxTotal: "2000.00",
        grandTotal: "10000.00",
        receivedAmount: "4000.00",
        adjustmentAmount: "1000.00",
        dueAmount: "5000.00",
      },
      pagination: { page: 1, pageSize: 25, total: 40 },
      meta: {
        currency: "INR",
        dateBasis: "INVOICE_DATE",
        from: "2026-08-01",
        to: "2026-08-31",
        balanceBasis: "CURRENT",
        generatedAt: "2026-09-11T10:00:00Z",
      },
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Print Vehicle-wise Invoices",
      }),
    );
    const printView = document.body.querySelector(".print-report");
    expect(
      Array.from(printView!.querySelectorAll("th"), (cell) => cell.textContent),
    ).toEqual([
      "Vehicle Registration Number",
      "Vehicle Name",
      "Vehicle Type",
      "Invoice Count",
      "Subtotal",
      "Tax Total",
      "Grand Total",
      "Received Amount",
      "Settlement Discount",
      "Due Amount",
      "First Invoice Date",
      "Latest Invoice Date",
    ]);
    expect(printView).toHaveTextContent("Vehicle Groups40");
    expect(printView).toHaveTextContent("Invoices95");
    expect(printView).toHaveTextContent("Grand Total₹10,000.00");
    expect(printView).toHaveTextContent("WB 01 AB 1234—SUV");
    expect(printView).toHaveTextContent("Current page · rows 1–25 of 40");
    expect(printView).not.toHaveTextContent("vehicle-internal-id");
  });

  it("does not expose Print without report authorization", async () => {
    vi.mocked(getCollection).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
    });
    vi.mocked(api).mockResolvedValue({
      data: [],
      summary: {
        total: 0,
        invoiceCount: 0,
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
    renderPage(false);
    await screen.findByText("No vehicle groups");
    expect(
      screen.queryByRole("button", { name: /Print Vehicle-wise Invoices/ }),
    ).not.toBeInTheDocument();
  });
});
