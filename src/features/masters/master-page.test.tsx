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
import { api, getCollection } from "@/lib/api/client";
import type { CoreMaster } from "@/lib/api/contracts";
import { configs } from "./master-config";
import { MasterPage } from "./master-page";

vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn(), getCollection: vi.fn() };
});

const company = master({ id: "company-1", name: "Eastern Risen Pvt Ltd" });
const bankAccount = master({
  id: "bank-1",
  name: "Eastern Bank",
  companyId: company.id,
  accountNumber: "0012345678",
  branch: "Kolkata",
  ifscCode: "ABCD0123456",
  swiftCode: null,
});
const serviceCategories = [
  master({
    id: "service-1",
    name: "Tours",
    code: "9985",
    requiresVehicle: false,
  }),
  master({
    id: "service-2",
    name: "Transport",
    code: "9964",
    requiresVehicle: true,
  }),
];

function master(values: Partial<CoreMaster>): CoreMaster {
  return {
    id: "record-1",
    status: "ACTIVE",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...values,
  };
}

function renderBankAccounts(
  bankAccounts: CoreMaster[] = [],
  companies: CoreMaster[] = [company],
) {
  vi.mocked(getCollection).mockImplementation(async (path) => ({
    data: path.startsWith("/companies") ? companies : bankAccounts,
    pagination: {
      page: 1,
      pageSize: path.startsWith("/companies") ? 100 : 25,
      total: path.startsWith("/companies")
        ? companies.length
        : bankAccounts.length,
    },
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <MasterPage config={configs["bank-accounts"]} role="CORE_ADMIN" />,
    { wrapper: Wrapper },
  );
}

function renderTaxRules(taxRules: CoreMaster[] = []) {
  vi.mocked(getCollection).mockImplementation(async (path) => ({
    data: path.startsWith("/service-categories") ? serviceCategories : taxRules,
    pagination: {
      page: 1,
      pageSize: path.startsWith("/service-categories") ? 100 : 25,
      total: path.startsWith("/service-categories")
        ? serviceCategories.length
        : taxRules.length,
    },
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <MasterPage config={configs["tax-rules"]} role="CORE_ADMIN" />,
    { wrapper: Wrapper },
  );
}

function renderServiceCategories(categories: CoreMaster[] = serviceCategories) {
  vi.mocked(getCollection).mockResolvedValue({
    data: categories,
    pagination: { page: 1, pageSize: 25, total: categories.length },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <MasterPage config={configs["service-categories"]} role="CORE_ADMIN" />,
    { wrapper: Wrapper },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("bank account company relationship", () => {
  it("selects an active company by name and submits its id", async () => {
    vi.mocked(api).mockResolvedValue({ data: bankAccount });
    renderBankAccounts();

    fireEvent.click(
      await screen.findByRole("button", { name: "New bank account" }),
    );
    const companySelect = await screen.findByLabelText("Company");
    expect(companySelect).toHaveDisplayValue("Select company");
    expect(
      screen.getByRole("option", { name: "Eastern Risen Pvt Ltd" }),
    ).toHaveValue("company-1");

    fireEvent.change(companySelect, { target: { value: company.id } });
    fireEvent.change(screen.getByLabelText("Bank name"), {
      target: { value: "Eastern Bank" },
    });
    fireEvent.change(screen.getByLabelText("Account number"), {
      target: { value: "0012345678" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create bank account" }),
    );

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/bank-accounts", {
        method: "POST",
        body: expect.objectContaining({
          companyId: "company-1",
          name: "Eastern Bank",
          accountNumber: "0012345678",
        }),
      }),
    );
  });

  it("shows the company name in the table instead of its id", async () => {
    renderBankAccounts([bankAccount]);

    expect(
      await screen.findByText("Eastern Risen Pvt Ltd"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Company" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("company-1")).not.toBeInTheDocument();
  });

  it("keeps the current inactive company available while editing", async () => {
    const inactiveCompany = { ...company, status: "INACTIVE" as const };
    renderBankAccounts([bankAccount], [inactiveCompany]);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByLabelText("Company")).toHaveValue("company-1");
    expect(
      screen.getByRole("option", {
        name: "Eastern Risen Pvt Ltd (inactive)",
      }),
    ).toBeInTheDocument();
  });

  it("prevents creation when there are no active companies", async () => {
    renderBankAccounts([], [{ ...company, status: "INACTIVE" }]);

    fireEvent.click(
      await screen.findByRole("button", { name: "New bank account" }),
    );

    expect(await screen.findByLabelText("Company")).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "No active companies available" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create bank account" }),
    ).toBeDisabled();
  });
});

describe("tax rule service category relationship", () => {
  it("creates one tax rule for each selected service category", async () => {
    vi.mocked(api).mockImplementation(async (_path, options) => ({
      data: master({
        id: `rule-${String((options?.body as Record<string, unknown>).serviceCategoryId)}`,
      }),
    }));
    renderTaxRules();

    fireEvent.click(
      await screen.findByRole("button", { name: "New tax rule" }),
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tours" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Transport" }));

    fireEvent.change(screen.getByLabelText("Rule name"), {
      target: { value: "GST rate" },
    });
    fireEvent.change(screen.getByLabelText("Rate (%)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create tax rule" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(1, "/tax-rules", {
      method: "POST",
      body: expect.objectContaining({ serviceCategoryId: "service-1" }),
    });
    expect(api).toHaveBeenNthCalledWith(2, "/tax-rules", {
      method: "POST",
      body: expect.objectContaining({ serviceCategoryId: "service-2" }),
    });
  });

  it("creates one all-services rule when no category is selected", async () => {
    vi.mocked(api).mockResolvedValue({ data: master({ id: "rule-all" }) });
    renderTaxRules();

    fireEvent.click(
      await screen.findByRole("button", { name: "New tax rule" }),
    );
    await screen.findByRole("checkbox", { name: "Tours" });
    fireEvent.change(screen.getByLabelText("Rule name"), {
      target: { value: "Default GST rate" },
    });
    fireEvent.change(screen.getByLabelText("Rate (%)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create tax rule" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/tax-rules", {
        method: "POST",
        body: expect.objectContaining({ serviceCategoryId: null }),
      }),
    );
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("blocks retry and explains when a batch partially succeeds", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ data: master({ id: "rule-service-1" }) })
      .mockRejectedValueOnce(new Error("Second request failed"));
    renderTaxRules();

    fireEvent.click(
      await screen.findByRole("button", { name: "New tax rule" }),
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tours" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Transport" }));

    fireEvent.change(screen.getByLabelText("Rule name"), {
      target: { value: "GST rate" },
    });
    fireEvent.change(screen.getByLabelText("Rate (%)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create tax rule" }));

    expect(
      await screen.findByText(
        /1 of 2 tax rules were created before a request failed/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create tax rule" }),
    ).toBeDisabled();
  });
});

describe("service category vehicle requirement", () => {
  it("shows the flag in the list and submits true on create", async () => {
    vi.mocked(api).mockResolvedValue({
      data: master({ id: "service-3", requiresVehicle: true }),
    });
    renderServiceCategories();

    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Not required")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "New service category" }),
    );
    fireEvent.change(screen.getByLabelText("Service name"), {
      target: { value: "Vehicle service" },
    });
    fireEvent.change(screen.getByLabelText("HSN / SAC code"), {
      target: { value: "9999" },
    });
    fireEvent.click(screen.getByLabelText("Requires vehicle"));
    fireEvent.click(
      screen.getByRole("button", { name: "Create service category" }),
    );

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/service-categories", {
        method: "POST",
        body: expect.objectContaining({ requiresVehicle: true }),
      }),
    );
  });

  it("submits false when the persisted flag is unchecked on edit", async () => {
    vi.mocked(api).mockResolvedValue({ data: serviceCategories[1] });
    renderServiceCategories([serviceCategories[1]]);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const checkbox = screen.getByLabelText("Requires vehicle");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/service-categories/service-2", {
        method: "PUT",
        body: expect.objectContaining({
          requiresVehicle: false,
          version: 1,
        }),
      }),
    );
  });
});

it("sends relationship and search filters to the backend without filtering matches locally", async () => {
  window.history.replaceState(
    {},
    "",
    "/bank-accounts?companyId=11111111-1111-4111-8111-111111111111",
  );
  try {
    renderBankAccounts([bankAccount]);
    await screen.findByText("Eastern Bank");
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "  TEST0000001  " },
    });
    await waitFor(() =>
      expect(getCollection).toHaveBeenCalledWith(
        "/bank-accounts?page=1&pageSize=25&q=TEST0000001&companyId=11111111-1111-4111-8111-111111111111",
        expect.any(AbortSignal),
      ),
    );
    // A backend match on a field absent from the table must remain visible.
    expect(await screen.findByText("Eastern Bank")).toBeInTheDocument();
    expect(
      vi
        .mocked(getCollection)
        .mock.calls.filter(([path]) => path.startsWith("/bank-accounts"))
        .every(([path]) => !path.includes("pageSize=100")),
    ).toBe(true);
  } finally {
    window.history.replaceState({}, "", "/");
  }
});
