// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commercialApi } from "./api";
import { PolicyPage } from "./policy-page";

vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return {
    ...actual,
    commercialApi: {
      ...actual.commercialApi,
      policy: vi.fn(),
      updatePolicy: vi.fn(),
    },
  };
});
vi.mock("./picker", () => ({
  MasterPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button onClick={() => onChange("company-1")}>Choose company</button>
  ),
}));
function show(role: "CORE_ADMIN" | "CORE_REPORT_VIEWER") {
  vi.mocked(commercialApi.policy).mockResolvedValue({
    data: {
      companyId: "company-1",
      initialPercent: 30,
      balanceDaysBefore: 30,
      fullPaymentWithinDays: 30,
      updatedAt: "2026-09-28T00:00:00Z",
    },
  });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PolicyPage role={role} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => (document.body.innerHTML = ""));
describe("payment policy permissions", () => {
  it("lets administrators submit valid values", async () => {
    vi.mocked(commercialApi.updatePolicy).mockResolvedValue({
      data: {
        companyId: "company-1",
        initialPercent: 40,
        balanceDaysBefore: 30,
        fullPaymentWithinDays: 30,
        updatedAt: "2026-09-29T00:00:00Z",
      },
    });
    show("CORE_ADMIN");
    fireEvent.click(screen.getByText("Choose company"));
    fireEvent.change(
      await screen.findByRole("spinbutton", {
        name: /Initial payment percent/,
      }),
      { target: { value: "40" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() =>
      expect(commercialApi.updatePolicy).toHaveBeenCalledWith("company-1", {
        initialPercent: 40,
        balanceDaysBefore: 30,
        fullPaymentWithinDays: 30,
      }),
    );
  });
  it("keeps report viewers read only", async () => {
    show("CORE_REPORT_VIEWER");
    fireEvent.click(screen.getByText("Choose company"));
    expect(
      await screen.findByRole("spinbutton", {
        name: /Initial payment percent/,
      }),
    ).toHaveAttribute("readonly");
    expect(
      screen.queryByRole("button", { name: "Save policy" }),
    ).not.toBeInTheDocument();
  });
});
