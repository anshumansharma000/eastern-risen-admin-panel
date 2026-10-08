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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError, getCollection, getResource } from "@/lib/api/client";
import type { CoreUser } from "@/lib/api/contracts";
import { AuditPage } from "./audit-page";
import { resolveAuditActor } from "./audit-actors";
import type { AuditRow } from "./contracts";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/reports/audit",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
  getCollection: vi.fn(),
  getResource: vi.fn(),
}));
const actor: CoreUser = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Asha Sharma",
  username: "asha",
  email: "asha@example.test",
  role: "CORE_DATA_ENTRY",
  status: "ARCHIVED",
};
const event: AuditRow = {
  id: "event-1",
  actorId: actor.id,
  action: "INVOICE_ISSUED",
  entityType: "INVOICE",
  entityId: "invoice-1",
  createdAt: "2026-10-08T00:00:00Z",
};
function mount(row: AuditRow | AuditRow[] = event) {
  vi.mocked(api).mockResolvedValue({
    data: Array.isArray(row) ? row : [row],
    summary: { total: 1 },
    pagination: { page: 1, pageSize: 25, total: 1 },
    meta: {
      currency: "INR",
      dateBasis: "EVENT_TIMESTAMP",
      from: null,
      to: null,
      balanceBasis: "CURRENT",
      generatedAt: "2026-10-08T00:00:00Z",
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuditPage />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getResource).mockRejectedValue(
    new ApiError(404, "NOT_FOUND", "Record not found"),
  );
  vi.mocked(getCollection).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("resolves archived actors beyond the first 100 staff with name, username and current role", async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({
    ...actor,
    id: `other-${index}`,
  }));
  vi.mocked(getCollection).mockImplementation(async (path) => {
    if (!path.includes("pageSize=100"))
      return { data: [], pagination: { page: 1, pageSize: 25, total: 0 } };
    const second = path.includes("page=2");
    return {
      data: second ? [actor] : first,
      pagination: { page: second ? 2 : 1, pageSize: 100, total: 101 },
    };
  });
  mount();
  expect(await screen.findByText("Asha Sharma")).toBeInTheDocument();
  expect(
    screen.getByText("@asha · Data-entry operator · current role"),
  ).toBeInTheDocument();
  expect(screen.getByText("Asha Sharma").closest("td")).toHaveAttribute(
    "title",
    actor.id,
  );
  expect(getCollection).toHaveBeenCalledWith(
    "/users?page=2&pageSize=100",
    expect.any(AbortSignal),
  );
  expect(
    vi
      .mocked(getCollection)
      .mock.calls.filter(([path]) => path.includes("pageSize=100"))
      .every(([path]) => !path.includes("status=")),
  ).toBe(true);
});
it("keeps audit events and ID fallback visible when staff lookup fails", async () => {
  vi.mocked(getCollection).mockImplementation(async (path) => {
    if (path.includes("pageSize=100"))
      throw new ApiError(503, "UNAVAILABLE", "Directory unavailable");
    return { data: [], pagination: { page: 1, pageSize: 25, total: 0 } };
  });
  mount();
  expect(await screen.findByText("Unknown actor")).toBeInTheDocument();
  expect(screen.getByText("Actor details unavailable")).toBeInTheDocument();
  expect(
    screen.getByRole("cell", { name: "Invoice issued" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Retry actor details" }),
    ).toBeInTheDocument(),
  );
});
it("uses actor identity from the report when present even if the directory is empty", async () => {
  vi.mocked(getCollection).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
  mount({
    ...event,
    actorDisplayName: "Former administrator",
    actorRole: "CORE_ADMIN",
  });
  expect(await screen.findByText("Former administrator")).toBeInTheDocument();
  expect(screen.getByText("Core administrator")).toBeInTheDocument();
});
it("does not guess system identity from an unmatched actor id", () => {
  expect(resolveAuditActor(event, [])).toEqual({
    name: "Unknown actor",
    details: "",
    resolved: false,
  });
});
it("falls back to username when staff display name is blank", () => {
  expect(
    resolveAuditActor(event, [{ ...actor, displayName: "  " }]),
  ).toMatchObject({ name: "asha", resolved: true });
});

it("shows invoice number and customer context, with untruncated IDs in event details", async () => {
  const entityId = "22222222-2222-4222-8222-222222222222";
  vi.mocked(getResource).mockResolvedValue({
    data: {
      id: entityId,
      invoiceNumber: "ER/26/17",
      invoiceDate: "2026-10-08",
      snapshot: { customer: { name: "Coastal Travel" } },
    },
  });
  mount({ ...event, entityId });
  expect(await screen.findByText("ER/26/17")).toBeInTheDocument();
  expect(
    screen.getByText("Customer: Coastal Travel · 2026-10-08"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open invoice" })).toHaveAttribute(
    "href",
    `/invoices/${entityId}`,
  );
  fireEvent.click(screen.getByText("Event details"));
  expect(screen.getByText(entityId)).toBeVisible();
  expect(screen.getByText("INVOICE_ISSUED", { selector: "dd" })).toBeVisible();
});
it("looks up a repeated record only once and resolves booking references", async () => {
  vi.mocked(getResource).mockResolvedValue({
    data: {
      booking: {
        id: "booking-1",
        reference: "BOOK-COAST-01",
        title: "Coastal tour",
      },
    },
  });
  const row = {
    ...event,
    entityType: "COMMERCIAL_BOOKING",
    entityId: "booking-1",
    action: "QUOTE_CREATED",
  };
  mount([row, { ...row, id: "event-2" }]);
  await screen.findAllByText("BOOK-COAST-01");
  expect(getResource).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("Coastal tour")).toHaveLength(2);
  expect(
    screen.getAllByRole("link", { name: "Open booking" })[0],
  ).toHaveAttribute("href", "/commercial-bookings/booking-1");
});
it("keeps full IDs accessible for deleted records without losing the audit event", async () => {
  const entityId = "deleted-customer-22222222-2222-4222-8222-222222222222";
  mount({ ...event, entityType: "CUSTOMER", entityId });
  expect(
    await screen.findByText("Customer · details unavailable"),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(getResource).toHaveBeenCalledWith(
      `/customers/${entityId}`,
      expect.any(AbortSignal),
    ),
  );
  expect(
    screen.getByRole("cell", { name: "Invoice issued" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText("Event details"));
  expect(screen.getByText(entityId)).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Open customer statement" }),
  ).not.toBeInTheDocument();
});
it("does not invent endpoints or names for unknown record types", async () => {
  mount({
    ...event,
    entityType: "UNSUPPORTED_WIDGET",
    entityId: "full-widget-record-id",
  });
  expect(
    await screen.findByText("Unsupported widget · details unavailable"),
  ).toBeInTheDocument();
  expect(getResource).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Event details"));
  expect(screen.getByText("full-widget-record-id")).toBeVisible();
});
it("resolves vehicle registration without inventing a vehicle detail route", async () => {
  vi.mocked(getResource).mockResolvedValue({
    data: {
      id: "vehicle-1",
      registrationNumber: "WB02AA1001",
      displayName: "Airport sedan",
    },
  });
  mount({ ...event, entityType: "VEHICLE", entityId: "vehicle-1" });
  expect(await screen.findByText("WB02AA1001")).toBeInTheDocument();
  expect(screen.getByText("Airport sedan")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open vehicles register" }),
  ).toHaveAttribute("href", "/vehicles");
});
