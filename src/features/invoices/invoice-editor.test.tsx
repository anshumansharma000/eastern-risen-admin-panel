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
import { api, getCollection, getResource } from "@/lib/api/client";
import type {
  CoreMaster,
  Invoice,
  ServiceCategory,
  Vehicle,
} from "@/lib/api/contracts";
import { InvoiceEditor, vehicleOptionLabel } from "./invoice-editor";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    api: vi.fn(),
    getCollection: vi.fn(),
    getResource: vi.fn(),
  };
});

const baseMaster = {
  status: "ACTIVE" as const,
  version: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const categories: ServiceCategory[] = [
  {
    ...baseMaster,
    id: "category-vehicle",
    name: "Road transfer",
    code: "A1",
    requiresVehicle: true,
  },
  {
    ...baseMaster,
    id: "category-other",
    name: "Planning",
    code: "B2",
    requiresVehicle: false,
  },
];
const vehicle: Vehicle = {
  id: "vehicle-1",
  registrationNumber: "WB 01 AB 1234",
  displayName: "Executive sedan",
  vehicleType: "Sedan",
  registeredOwner: null,
  address: null,
  contactNumber: null,
  accountNumber: null,
  ifscCode: null,
  bankName: null,
  status: "ACTIVE",
  createdAt: baseMaster.createdAt,
  updatedAt: baseMaster.updatedAt,
  archivedAt: null,
};

function renderEditor(invoice?: Invoice) {
  vi.mocked(getCollection).mockImplementation(async (path) => {
    const data: Array<CoreMaster | Vehicle> = path.startsWith("/vehicles")
      ? [vehicle, { ...vehicle, id: "inactive", status: "DEACTIVATED" }]
      : path.startsWith("/service-categories")
        ? categories
        : [];
    return {
      data,
      pagination: { page: 1, pageSize: 100, total: data.length },
    };
  });
  if (invoice) vi.mocked(getResource).mockResolvedValue({ data: invoice });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<InvoiceEditor id={invoice?.id} />, { wrapper: Wrapper });
}

function completeLine() {
  fireEvent.change(screen.getByLabelText("Service description"), {
    target: { value: "Airport transfer" },
  });
  fireEvent.change(screen.getByLabelText("Amount (INR)"), {
    target: { value: "1000" },
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InvoiceEditor vehicle requirement", () => {
  it("blocks a vehicle category until an active vehicle is selected", async () => {
    vi.mocked(api).mockResolvedValue({ data: { id: "invoice-new" } });
    renderEditor();

    fireEvent.change(await screen.findByLabelText("Service category"), {
      target: { value: "category-vehicle" },
    });
    completeLine();
    const form = screen
      .getByRole("button", { name: "Save & calculate" })
      .closest("form")!;
    fireEvent.submit(form);

    expect(
      await screen.findByText(
        "Select an active vehicle for this service category.",
      ),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    const optionLabel = vehicleOptionLabel(vehicle);
    const vehicleInput = screen.getByLabelText("Vehicle");
    fireEvent.change(vehicleInput, { target: { value: optionLabel } });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/invoices", {
        method: "POST",
        body: expect.objectContaining({ vehicleId: "vehicle-1" }),
      }),
    );
    expect(screen.queryByDisplayValue(/inactive/i)).not.toBeInTheDocument();
  });

  it("clears and submits null when changed to a non-vehicle category", async () => {
    vi.mocked(api).mockResolvedValue({ data: { id: "invoice-new" } });
    renderEditor();

    const category = await screen.findByLabelText("Service category");
    fireEvent.change(category, { target: { value: "category-vehicle" } });
    completeLine();
    fireEvent.change(screen.getByLabelText("Vehicle"), {
      target: { value: vehicleOptionLabel(vehicle) },
    });
    fireEvent.change(category, { target: { value: "category-other" } });

    expect(screen.queryByLabelText("Vehicle")).not.toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole("button", { name: "Save & calculate" }).closest("form")!,
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/invoices", {
        method: "POST",
        body: expect.objectContaining({ vehicleId: null }),
      }),
    );
  });

  it("initializes a draft from details.vehicleId before top-level vehicleId", async () => {
    renderEditor({
      id: "invoice-1",
      version: 2,
      status: "DRAFT",
      invoiceNumber: null,
      companyId: "company-1",
      customerId: "customer-1",
      guestDisplayText: "Guest",
      serviceCategoryId: "category-vehicle",
      vehicleId: "vehicle-2",
      details: { vehicleId: "vehicle-1" },
      invoiceDate: "2026-09-11",
      serviceProvidedAt: "Kolkata",
      placeOfSupplyState: "West Bengal",
      placeOfSupplyCountry: "India",
      subtotal: "1000.00",
      taxTotal: "0.00",
      grandTotal: "1000.00",
      lines: [
        {
          id: "line-1",
          position: 1,
          description: "Airport transfer",
          amount: "1000.00",
          taxTreatment: "NON_TAXABLE",
          taxAmount: "0.00",
          total: "1000.00",
        },
      ],
      createdAt: baseMaster.createdAt,
      updatedAt: baseMaster.updatedAt,
    });

    expect(await screen.findByLabelText("Vehicle")).toHaveValue(
      vehicleOptionLabel(vehicle),
    );
  });
});
