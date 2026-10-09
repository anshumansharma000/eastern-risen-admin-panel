// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { commercialApi, type BookingListRow } from "./api";
import { BookingList } from "./booking-list";
import { getCollection } from "@/lib/api/client";
const replace = vi.hoisted(() => vi.fn());
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/commercial-bookings",
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  getCollection: vi.fn(),
}));
vi.mock("./api", () => ({ commercialApi: { list: vi.fn() } }));
const row: BookingListRow = {
  id: "booking-1",
  reference: "Coast",
  title: "Tour",
  customerName: "Named customer",
  customerId: "customer-1",
  companyId: "company-1",
  serviceCategoryId: "service-1",
  status: "QUOTED",
  serviceStartsOn: "2026-10-20",
  serviceEndsOn: null,
  invoiceId: null,
  latestQuoteVersion: 2,
  latestQuoteAcceptedAt: null,
  invoiceNumber: null,
  receivedAmount: null,
  dueAmount: null,
};
function mount() {
  vi.mocked(getCollection).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookingList role="CORE_REPORT_VIEWER" />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  search = new URLSearchParams();
});
it("uses whole-register filters and total rather than inferring the last page from row count", async () => {
  search = new URLSearchParams(
    "q=Coast&quoteAcceptance=AWAITING_ACCEPTANCE&serviceStartsFrom=2026-10-01&page=2",
  );
  vi.mocked(commercialApi.list).mockResolvedValue({
    data: [row],
    pagination: { page: 2, pageSize: 25, total: 130 },
  });
  mount();
  await screen.findByText("Named customer");
  expect(commercialApi.list).toHaveBeenCalledWith(2, expect.any(AbortSignal), {
    q: "Coast",
    quoteAcceptance: "AWAITING_ACCEPTANCE",
    serviceStartsFrom: "2026-10-01",
  });
  expect(screen.getByText("Version 2")).toBeInTheDocument();
  expect(screen.getByText("No invoice")).toBeInTheDocument();
  expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Latest quote"), {
    target: { value: "ACCEPTED" },
  });
  const target = new URL(replace.mock.calls.at(-1)![0], "http://test");
  expect(target.searchParams.get("quoteAcceptance")).toBe("ACCEPTED");
  expect(target.searchParams.has("page")).toBe(false);
});
it("renders exact backend balances without adding gateway amounts", async () => {
  vi.mocked(commercialApi.list).mockResolvedValue({
    data: [
      {
        ...row,
        invoiceId: "invoice-1",
        invoiceNumber: "ER/1",
        receivedAmount: "120.30",
        dueAmount: "869.70",
      },
    ],
    pagination: { page: 1, pageSize: 25, total: 1 },
  });
  mount();
  expect(await screen.findByText("₹120.30")).toBeInTheDocument();
  expect(screen.getByText("₹869.70")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "ER/1" })).toHaveAttribute(
    "href",
    "/invoices/detail?id=invoice-1",
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
it("retains pagination on an empty page and blocks a reversed date range", async () => {
  search = new URLSearchParams("page=8");
  vi.mocked(commercialApi.list).mockResolvedValue({
    data: [],
    pagination: { page: 8, pageSize: 25, total: 130 },
  });
  const view = mount();
  await screen.findByText("No matching bookings");
  expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  search = new URLSearchParams(
    "serviceStartsFrom=2026-11-01&serviceStartsTo=2026-10-01",
  );
  vi.mocked(commercialApi.list).mockClear();
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <BookingList role="CORE_REPORT_VIEWER" />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("on or after"),
  );
  expect(commercialApi.list).not.toHaveBeenCalled();
});
