"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CoreRole } from "@/lib/api/contracts";
import { formatINR } from "@/lib/money";
import {
  Button,
  Empty,
  ErrorState,
  Loading,
  StatusBadge,
  Field,
  Input,
  Select,
  Pagination,
} from "@/components/ui";
import {
  MasterPicker,
  SearchFilter,
  selectReportParams,
  useReportParams,
} from "@/features/reports/report-shared";
import { commercialApi } from "./api";

const allowed = [
  "q",
  "status",
  "companyId",
  "customerId",
  "serviceStartsFrom",
  "serviceStartsTo",
  "quoteAcceptance",
  "page",
] as const;
const statuses = [
  "DRAFT",
  "QUOTED",
  "INVOICED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
];
const acceptance = ["NONE", "AWAITING_ACCEPTANCE", "ACCEPTED"];
export function bookingListParams(values: Record<string, string>) {
  const params = selectReportParams(values, allowed);
  delete params.pageSize;
  if (params.status && !statuses.includes(params.status)) delete params.status;
  if (params.quoteAcceptance && !acceptance.includes(params.quoteAcceptance))
    delete params.quoteAcceptance;
  if (params.q) params.q = params.q.trim().slice(0, 200);
  return params;
}
export function BookingList({ role }: { role: CoreRole }) {
  const state = useReportParams();
  const params = bookingListParams(state.params);
  const page = Number(params.page || 1);
  const filters = { ...params };
  delete filters.page;
  const valid =
    !params.serviceStartsFrom ||
    !params.serviceStartsTo ||
    params.serviceStartsFrom <= params.serviceStartsTo;
  const query = useQuery({
    queryKey: ["commercial-bookings", page, filters],
    queryFn: ({ signal }) => commercialApi.list(page, signal, filters),
    enabled: valid,
  });
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Commercial bookings</p>
          <h1>Bookings and quotes</h1>
          <p>
            Track customer acceptance, invoicing, payment schedules, and
            collection.
          </p>
        </div>
        {role !== "CORE_REPORT_VIEWER" && (
          <Link
            className="button button-primary"
            href="/commercial-bookings/new"
          >
            New booking
          </Link>
        )}
      </header>
      <section className="report-filters" aria-label="Booking filters">
        <SearchFilter
          value={params.q ?? ""}
          onChange={(value) => state.setFilter("q", value)}
        />
        <Field label="Status">
          <Select
            value={params.status ?? ""}
            onChange={(event) => state.setFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Latest quote">
          <Select
            value={params.quoteAcceptance ?? ""}
            onChange={(event) =>
              state.setFilter("quoteAcceptance", event.target.value)
            }
          >
            <option value="">All acceptance states</option>
            <option value="NONE">No quote</option>
            <option value="AWAITING_ACCEPTANCE">Awaiting acceptance</option>
            <option value="ACCEPTED">Accepted</option>
          </Select>
        </Field>
        <Field label="Service starts from">
          <Input
            type="date"
            value={params.serviceStartsFrom ?? ""}
            max={params.serviceStartsTo || undefined}
            onChange={(event) =>
              state.setFilter("serviceStartsFrom", event.target.value)
            }
          />
        </Field>
        <Field label="Service starts to">
          <Input
            type="date"
            value={params.serviceStartsTo ?? ""}
            min={params.serviceStartsFrom || undefined}
            onChange={(event) =>
              state.setFilter("serviceStartsTo", event.target.value)
            }
          />
        </Field>
      </section>
      <details
        className="secondary-details"
        open={Boolean(params.companyId || params.customerId)}
      >
        <summary>Company and customer filters</summary>
        <div className="report-filters">
          <MasterPicker
            resource="companies"
            label="Company"
            value={params.companyId ?? ""}
            onChange={(value) => state.setFilter("companyId", value)}
          />
          <MasterPicker
            resource="customers"
            label="Customer"
            value={params.customerId ?? ""}
            onChange={(value) => state.setFilter("customerId", value)}
          />
        </div>
      </details>
      {Object.keys(filters).length > 0 && (
        <Button variant="ghost" onClick={state.clear}>
          Clear filters
        </Button>
      )}
      <p className="filter-scope">
        Filters search all bookings. Acceptance is for the latest quote.
        Balances include confirmed receipts and active settlement adjustments.
      </p>
      {!valid ? (
        <p role="alert" className="field-error">
          To date must be on or after the from date.
        </p>
      ) : query.isLoading ? (
        <Loading label="Loading bookings" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.data.length ? (
        <Empty
          title="No matching bookings"
          detail="Adjust the filters or create a booking."
          action={
            <Button variant="secondary" onClick={state.clear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <section className="table-card" aria-busy={query.isFetching}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Booking / customer</th>
                  <th>Service starts</th>
                  <th>Status</th>
                  <th>Latest quote</th>
                  <th>Invoice</th>
                  <th className="numeric">Received</th>
                  <th className="numeric">Outstanding</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>{booking.reference}</strong>
                      <small className="table-sub">{booking.title}</small>
                      <small className="table-sub">
                        {booking.customerName}
                      </small>
                    </td>
                    <td>{booking.serviceStartsOn ?? "—"}</td>
                    <td>
                      <StatusBadge value={booking.status} />
                    </td>
                    <td>
                      {booking.latestQuoteVersion == null ? (
                        "No quote"
                      ) : (
                        <>
                          <strong>Version {booking.latestQuoteVersion}</strong>
                          <small className="table-sub">
                            {booking.latestQuoteAcceptedAt
                              ? "Accepted"
                              : "Awaiting acceptance"}
                          </small>
                        </>
                      )}
                    </td>
                    <td>
                      {booking.invoiceId ? (
                        <Link
                          className="text-link"
                          href={`/invoices/${encodeURIComponent(booking.invoiceId)}`}
                        >
                          {booking.invoiceNumber ?? "Draft invoice"}
                        </Link>
                      ) : (
                        "No invoice"
                      )}
                    </td>
                    <td className="numeric">
                      {booking.receivedAmount == null
                        ? "—"
                        : formatINR(booking.receivedAmount)}
                    </td>
                    <td className="numeric">
                      {booking.dueAmount == null
                        ? "—"
                        : formatINR(booking.dueAmount)}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/commercial-bookings/${encodeURIComponent(booking.id)}`}
                      >
                        View booking
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {valid && query.data && (
        <Pagination
          {...query.data.pagination}
          onPage={(value) => state.update({ page: value })}
        />
      )}
    </>
  );
}
