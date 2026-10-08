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
import { api, ApiError, getCollection } from "@/lib/api/client";
import type { CoreRole, Vehicle } from "@/lib/api/contracts";
import { buildVehiclePayload, VehiclesPage } from "./vehicles-page";

vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn(), getCollection: vi.fn() };
});

const vehicle: Vehicle = {
  id: "vehicle-1",
  registrationNumber: "WB02AA1001",
  displayName: "Airport sedan",
  vehicleType: "Sedan",
  registeredOwner: "Asha Sen",
  address: "Kolkata",
  contactNumber: "09876543210",
  accountNumber: "0012345678",
  ifscCode: "ABCD0123456",
  bankName: "Eastern Bank",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  archivedAt: null,
};

function renderPage(role: CoreRole, records: Vehicle[] = [vehicle]) {
  vi.mocked(getCollection).mockResolvedValue({
    data: records,
    pagination: { page: 1, pageSize: 25, total: records.length },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<VehiclesPage role={role} />, { wrapper: Wrapper });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("vehicle payload", () => {
  it("includes required fields, turns cleared optionals into null, and preserves leading zeroes", () => {
    const data = new FormData();
    data.set("registrationNumber", " WB02AA1001 ");
    data.set("displayName", " Airport sedan ");
    data.set("vehicleType", " Sedan ");
    data.set("registeredOwner", " ");
    data.set("accountNumber", "0012345678");

    expect(buildVehiclePayload(data)).toEqual({
      registrationNumber: "WB02AA1001",
      displayName: "Airport sedan",
      vehicleType: "Sedan",
      registeredOwner: null,
      address: null,
      contactNumber: null,
      accountNumber: "0012345678",
      ifscCode: null,
      bankName: null,
    });
  });
});

describe("VehiclesPage", () => {
  it("constructs the complete POST payload and requires vehicle type", async () => {
    vi.mocked(api).mockResolvedValue({ data: vehicle });
    renderPage("CORE_DATA_ENTRY", []);
    fireEvent.click(await screen.findByRole("button", { name: "Add vehicle" }));

    expect(screen.getByLabelText("Vehicle type")).toBeRequired();
    fireEvent.change(screen.getByLabelText("Registration number"), {
      target: { value: "WB02AA1001" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Airport sedan" },
    });
    fireEvent.change(screen.getByLabelText("Vehicle type"), {
      target: { value: "Sedan" },
    });
    fireEvent.change(screen.getByLabelText(/^Account number/), {
      target: { value: "0012345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/vehicles", {
        method: "POST",
        body: expect.objectContaining({
          registrationNumber: "WB02AA1001",
          displayName: "Airport sedan",
          vehicleType: "Sedan",
          accountNumber: "0012345678",
          registeredOwner: null,
        }),
      }),
    );
    expect(api).not.toHaveBeenCalledWith(
      expect.stringContaining("vehicle-profiles"),
      expect.anything(),
    );
  });

  it("constructs a full PUT payload and allows optional values to be cleared", async () => {
    vi.mocked(api).mockResolvedValue({ data: { ...vehicle, bankName: null } });
    renderPage("CORE_DATA_ENTRY");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Registered owner"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Bank name"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/vehicles/vehicle-1", {
        method: "PUT",
        body: expect.objectContaining({
          registrationNumber: vehicle.registrationNumber,
          displayName: vehicle.displayName,
          vehicleType: vehicle.vehicleType,
          registeredOwner: null,
          bankName: null,
          accountNumber: "0012345678",
        }),
      }),
    );
  });

  it("shows backend validation beside the affected field", async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(
        422,
        "VALIDATION_FAILED",
        "Check vehicle details.",
        "req-vehicle",
        {
          fields: [{ field: "registrationNumber", message: "Already in use." }],
        },
      ),
    );
    renderPage("CORE_DATA_ENTRY");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));
    expect(
      (await screen.findAllByText("Already in use.")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("req-vehicle")).toBeInTheDocument();
  });

  it.each([
    ["CORE_ADMIN", true, true],
    ["CORE_DATA_ENTRY", true, false],
    ["CORE_REPORT_VIEWER", false, false],
  ] as const)(
    "shows the correct controls for %s",
    async (role, edit, lifecycle) => {
      renderPage(role);
      await screen.findByText("WB02AA1001");
      expect(screen.queryByRole("button", { name: "Edit" }) !== null).toBe(
        edit,
      );
      expect(
        screen.queryByRole("button", { name: "Deactivate" }) !== null,
      ).toBe(lifecycle);
      expect(screen.queryByRole("button", { name: "Archive" }) !== null).toBe(
        lifecycle,
      );
    },
  );

  it("keeps archived vehicles read-only for administrators", async () => {
    renderPage("CORE_ADMIN", [
      { ...vehicle, status: "ARCHIVED", archivedAt: vehicle.updatedAt },
    ]);
    expect(await screen.findByText("Archived — read only")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Activate" }),
    ).not.toBeInTheDocument();
  });
});
