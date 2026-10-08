// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BookingNew, hasInternationalMobile } from "./booking-new";
import { commercialApi } from "./api";

vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return {
    ...actual,
    commercialApi: { ...actual.commercialApi, create: vi.fn() },
  };
});
vi.mock("./picker", () => ({
  MasterPicker: ({
    label,
    onChange,
  }: {
    label: string;
    onChange: (
      id: string,
      item: { id: string; name: string; mobileNumber?: string },
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange(label, {
          id: label,
          name: label,
          mobileNumber: label === "Customer" ? "+44 1234 567890" : undefined,
        })
      }
    >
      Select {label}
    </button>
  ),
}));
afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

it("allows booking creation with a country-coded mobile number", async () => {
  vi.mocked(commercialApi.create).mockResolvedValue({
    data: {
      booking: {
        id: "b",
        reference: "R",
        title: "Tour",
        companyId: "Company",
        customerId: "Customer",
        serviceCategoryId: "Service category",
        status: "DRAFT",
        serviceStartsOn: null,
        serviceEndsOn: null,
      },
      accessToken: "token",
    },
  });
  const { container } = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <BookingNew />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Select Company"));
  fireEvent.click(screen.getByText("Select Customer"));
  fireEvent.click(screen.getByText("Select Service category"));
  expect(screen.getByRole("button", { name: "Create booking" })).toBeEnabled();
  expect(
    screen.queryByText(/Add a mobile number with country code/),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Staff reference" }), {
    target: { value: "R" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Tour or service title" }),
    { target: { value: "Tour" } },
  );
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() =>
    expect(commercialApi.create).toHaveBeenCalledWith(
      {
        reference: "R",
        title: "Tour",
        companyId: "Company",
        customerId: "Customer",
        serviceCategoryId: "Service category",
        serviceStartsOn: null,
        serviceEndsOn: null,
      },
      expect.anything(),
    ),
  );
});

it("recognizes an international mobile number without assuming ten digits", () => {
  expect(hasInternationalMobile("+44 1234 567890")).toBe(true);
  expect(hasInternationalMobile("+1 (212) 555-1234")).toBe(true);
  expect(hasInternationalMobile("9876543210")).toBe(false);
  expect(hasInternationalMobile("+01234567890")).toBe(false);
});
