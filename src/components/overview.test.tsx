// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, getCollection } from "@/lib/api/client";
import type { DashboardResponse } from "@/features/reports/contracts";
import { Overview } from "./overview";
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams("from=2026-10-01&to=2026-10-31&companyId=company-1"),
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
  getCollection: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("links the global payment review count without copying dashboard scope filters", async () => {
  const dashboard: DashboardResponse = {
    data: {
      period: { from: "2026-10-01", to: "2026-10-31" },
      currency: "INR",
      balanceBasis: "CURRENT",
      generatedAt: "2026-10-08T00:00:00Z",
      cards: {
        issuedInvoiceCount: 0,
        invoicedAmount: "0.00",
        taxBilled: "0.00",
        cashReceivedDuringPeriod: "0.00",
        outstandingNow: "0.00",
        settlementDiscountsDuringPeriod: "0.00",
        overdueAmount: "0.00",
        overdueInvoiceCount: 0,
        cashCollectionRate: null,
        settlementCoverageRate: null,
      },
      alerts: {
        paymentsRequiringReview: 4,
        staleDrafts: 0,
        receivablesWithoutDueDate: 0,
        incompleteCompanies: 0,
        hotelRatesExpiringSoon: 0,
        staleOutboxEvents: 0,
      },
      financialTrend: [],
      receivablesAgeing: [],
      customerCategoryMix: [],
      serviceCategoryMix: [],
      paymentMethodMix: [],
      topOutstandingCustomers: [],
      recentActivity: [],
    },
  };
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith("/reports/dashboard")
      ? dashboard
      : { data: { id: "company-1", name: "Eastern Risen" } },
  );
  vi.mocked(getCollection).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Overview role="CORE_REPORT_VIEWER" />
    </QueryClientProvider>,
  );
  const link = await screen.findByRole("link", {
    name: /Payments requiring review/,
  });
  expect(link).toHaveTextContent("4");
  expect(link).toHaveAttribute(
    "href",
    "/reports/payments-received?needsReview=true",
  );
  expect(
    screen.getByText(/Payment reviews are a global operational count/),
  ).toBeInTheDocument();
});
