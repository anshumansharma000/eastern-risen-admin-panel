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
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, getResource } from "@/lib/api/client";
import type { CoreRole, Invoice } from "@/lib/api/contracts";
import { InvoiceDetail } from "./invoice-detail";

vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn(), getResource: vi.fn() };
});

const invoice: Invoice = {
  id: "invoice-1",
  version: 1,
  status: "DRAFT",
  invoiceNumber: null,
  companyId: "company-uuid",
  customerId: "customer-uuid",
  guestId: "guest-uuid",
  guestDisplayText: "Anika group",
  passengerCount: 4,
  serviceCategoryId: "service-uuid",
  invoiceDate: "2026-09-09",
  dueDate: "2026-09-16",
  serviceProvidedAt: "Kolkata",
  placeOfSupplyState: "West Bengal",
  placeOfSupplyCountry: "India",
  label: "Airport transfer",
  bankAccountIds: ["bank-uuid"],
  subtotal: "10000.00",
  taxTotal: "1800.00",
  grandTotal: "11800.00",
  lines: [
    {
      id: "line-1",
      position: 1,
      description: "Car service",
      amount: "10000.00",
      taxTreatment: "TAXABLE",
      taxAmount: "1800.00",
      total: "11800.00",
      appliedTaxes: [
        {
          component: "IGST",
          rate: "18.00",
          amount: "1800.00",
          ruleId: "rule-1",
        },
      ],
    },
  ],
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

function renderInvoice(
  value: Invoice = invoice,
  options: { role?: CoreRole; categoryRequiresVehicle?: boolean } = {},
) {
  vi.mocked(getResource).mockImplementation(async (path) => {
    if (path === "/invoices/invoice-1") return { data: value };
    const names: Record<string, string> = {
      "/companies/company-uuid": "Eastern Risen Pvt Ltd",
      "/customers/customer-uuid": "Acme Travel",
      "/guests/guest-uuid": "Anika Sharma",
      "/service-categories/service-uuid": "Transport",
      "/bank-accounts/bank-uuid": "Operations account",
    };
    return {
      data: {
        id: path,
        name: names[path],
        code: path === "/service-categories/service-uuid" ? "9964" : undefined,
        requiresVehicle:
          path === "/service-categories/service-uuid"
            ? (options.categoryRequiresVehicle ?? false)
            : undefined,
        status: "ACTIVE",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <InvoiceDetail
      id="invoice-1"
      role={options.role ?? "CORE_REPORT_VIEWER"}
    />,
    { wrapper: Wrapper },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InvoiceDetail", () => {
  it("shows resolved names, captured metadata, and an explicit tax breakdown", async () => {
    renderInvoice();

    expect((await screen.findAllByText("Acme Travel")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("customer-uuid")).not.toBeInTheDocument();
    expect(screen.getAllByText("Eastern Risen Pvt Ltd")).not.toHaveLength(0);
    expect(screen.getAllByText("Anika group")).not.toHaveLength(0);
    expect(screen.getAllByText("Kolkata")).not.toHaveLength(0);
    expect(screen.getAllByText("West Bengal, India")).not.toHaveLength(0);
    expect(screen.getAllByText(/IGST/)).not.toHaveLength(0);
    expect(screen.getAllByText(/18\.00%/)).not.toHaveLength(0);
    expect(screen.getAllByText("₹1,800.00")).not.toHaveLength(0);
  });

  it("builds a reference-style printable tax invoice", async () => {
    const view = renderInvoice();

    await screen.findAllByText("Acme Travel");
    const printable = view.container.querySelector(".print-invoice");
    expect(printable).toHaveTextContent("Draft Tax Invoice");
    expect(printable).toHaveTextContent("Eastern Risen Pvt Ltd");
    expect(printable).toHaveTextContent("Transport (HSN/SAC CODE:");
    expect(printable).toHaveTextContent("IGST @ 18.00%");
    expect(printable).toHaveTextContent(
      "Tax applied: IGST @ 18.00% = ₹1,800.00",
    );
    expect(printable).toHaveTextContent(
      "Tax calculationTotals of the item-level tax shown above",
    );
    expect(printable).toHaveTextContent(
      "Rupees Eleven Thousand Eight Hundred Only.",
    );
    expect(printable).toHaveTextContent("Bank Details:");
    expect(
      printable?.querySelector('img[alt="Eastern Risen"]'),
    ).toHaveAttribute("src", "/invoice/eastern-risen-logo.png");
    expect(
      printable?.querySelector('img[alt="Authorised signature"]'),
    ).toHaveAttribute("src", "/invoice/er-signature.png");
    expect(
      printable?.querySelector(
        'img[alt="Eastern Risen accreditations and memberships"]',
      ),
    ).toHaveAttribute("src", "/invoice/footer-logos.jpg");
  });

  it("separates taxable and non-taxable lines in print", async () => {
    const view = renderInvoice({
      ...invoice,
      subtotal: "10050.00",
      grandTotal: "11850.00",
      lines: [
        ...(invoice.lines ?? []),
        {
          id: "line-2",
          position: 2,
          description: "Parking fee",
          amount: "50.00",
          taxTreatment: "NON_TAXABLE",
          taxAmount: "0.00",
          total: "50.00",
          appliedTaxes: [],
        },
      ],
    });

    await screen.findAllByText("Acme Travel");
    const printable = view.container.querySelector(".print-invoice");
    expect(printable).toHaveTextContent("Non Taxable Item");
    expect(printable).toHaveTextContent("Total Non Taxable Amount₹50.00");
    expect(printable).toHaveTextContent("Taxable Item");
    expect(printable).toHaveTextContent("Total Amount Before Tax₹10,000.00");
  });

  it("makes a missing server tax breakdown explicit", async () => {
    renderInvoice({
      ...invoice,
      lines: invoice.lines?.map((line) => ({
        ...line,
        appliedTaxes: undefined,
      })),
    });

    expect(
      await screen.findByText("Type and rate unavailable from API"),
    ).toBeInTheDocument();
  });

  it("renders vehicle details only from the immutable snapshot", async () => {
    const view = renderInvoice({
      ...invoice,
      vehicleId: "vehicle-1",
      details: { vehicleId: "vehicle-1" },
      snapshot: {
        vehicle: {
          id: "vehicle-1",
          registrationNumber: "WB 01 AB 1234",
          name: "Original sedan name",
          vehicleType: "Sedan",
        },
      },
    });

    const vehicleSection = await screen.findByRole("region", {
      name: "Vehicle",
    });
    expect(vehicleSection).toHaveTextContent(
      "WB 01 AB 1234 — Original sedan name",
    );
    expect(vehicleSection).toHaveTextContent("Sedan");
    expect(view.container.querySelector(".print-invoice")).toHaveTextContent(
      "Vehicle: WB 01 AB 1234 — Original sedan name (Sedan)",
    );
    expect(getResource).not.toHaveBeenCalledWith(
      expect.stringContaining("/vehicles/"),
      expect.anything(),
    );
  });

  it("omits the vehicle sections for legacy invoices without a snapshot", async () => {
    const view = renderInvoice();

    await screen.findAllByText("Acme Travel");
    expect(
      screen.queryByRole("region", { name: "Vehicle" }),
    ).not.toBeInTheDocument();
    expect(
      view.container.querySelector(".print-invoice"),
    ).not.toHaveTextContent("Vehicle:");
  });

  it("blocks issue when the current category requires a missing vehicle", async () => {
    renderInvoice(invoice, {
      role: "CORE_ADMIN",
      categoryRequiresVehicle: true,
    });

    const issueButton = await screen.findByRole("button", {
      name: "Issue invoice",
    });
    await waitFor(() => expect(issueButton).toBeEnabled());
    fireEvent.click(issueButton);

    expect(
      await screen.findByText(
        "Select an active vehicle on the draft before issuing this service category.",
      ),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});

it("sets pending status for cheque/DD and uses today's receipt date", async () => {
  renderInvoice(
    {
      ...invoice,
      status: "ISSUED",
      invoiceNumber: "ER-1",
      dueAmount: "11800.00",
    },
    { role: "CORE_ADMIN" },
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Record receipt" }),
  );
  expect(screen.getByLabelText("Initial status")).toHaveValue("CONFIRMED");
  fireEvent.change(screen.getByLabelText("Method"), {
    target: { value: "CHEQUE" },
  });
  expect(screen.getByLabelText("Initial status")).toHaveValue("PENDING");
  fireEvent.change(screen.getByLabelText("Method"), {
    target: { value: "CASH" },
  });
  expect(screen.getByLabelText("Initial status")).toHaveValue("CONFIRMED");
  fireEvent.change(screen.getByLabelText("Method"), {
    target: { value: "DD" },
  });
  expect(screen.getByLabelText("Initial status")).toHaveValue("PENDING");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  expect(screen.getByLabelText("Received date")).toHaveValue(
    today < invoice.invoiceDate ? invoice.invoiceDate : today,
  );
});
