"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { CoreRole } from "@/lib/api/contracts";
import type {
  InvoiceReportRow,
  InvoiceSummary,
} from "@/features/reports/contracts";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Loading,
  Select,
  StatusBadge,
} from "@/components/ui";
import {
  ActiveFilters,
  DateRangeFields,
  DateRangeError,
  PeriodPresets,
  ReportPagination,
  SearchFilter,
  selectReportParams,
  useReport,
  useReportParams,
  validRange,
} from "@/features/reports/report-shared";

const allowed = [
  "q",
  "status",
  "paymentStatus",
  "from",
  "to",
  "page",
  "pageSize",
  "sortBy",
  "sortOrder",
] as const;
export function InvoiceList({ role }: { role: CoreRole }) {
  const state = useReportParams();
  const params = selectReportParams(state.params, allowed);
  const list = useReport<InvoiceReportRow, InvoiceSummary>(
    "/reports/invoices",
    params,
    validRange(params),
  );
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Invoices</h1>
          <p>Find invoices, review drafts, and track outstanding payments.</p>
        </div>
        {can(role, "billing") && (
          <Link className="button button-primary" href="/invoices/new">
            <Plus size={17} /> New draft invoice
          </Link>
        )}
      </header>
      <div className="status-tabs" role="group" aria-label="Invoice status">
        {[
          ["", "All invoices"],
          ["DRAFT", "Drafts"],
          ["ISSUED", "Issued"],
          ["CANCELLED", "Cancelled"],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={(params.status ?? "") === value ? "primary" : "ghost"}
            aria-pressed={(params.status ?? "") === value}
            onClick={() => state.setFilter("status", value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <PeriodPresets params={params} update={state.update} />
      <section className="report-filters" aria-label="Invoice filters">
        <SearchFilter
          value={params.q ?? ""}
          onChange={(value) => state.setFilter("q", value)}
        />
        <DateRangeFields params={params} setFilter={state.setFilter} />
        <Field label="Payment status">
          <Select
            value={params.paymentStatus ?? ""}
            onChange={(event) =>
              state.setFilter("paymentStatus", event.target.value)
            }
          >
            <option value="">All payment states</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
          </Select>
        </Field>
      </section>
      <p className="filter-scope">
        Without a custom date range, invoices are shown for the current
        financial year. Drafts receive an invoice number when issued.
      </p>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {list.isLoading ? (
        <Loading label="Loading invoices" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        list.data && (
          <>
            {!list.data.data.length ? (
              <Empty
                title="No matching invoices"
                detail="Adjust the filters or create a new draft."
                action={
                  <Button variant="secondary" onClick={state.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <section className="table-card" aria-busy={list.isFetching}>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Customer / traveller</th>
                        <th>Date / due date</th>
                        <th className="numeric">Total</th>
                        <th className="numeric">Outstanding</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.data.map((invoice) => (
                        <tr key={invoice.invoiceId}>
                          <td>
                            <Link
                              className="text-link"
                              href={`/invoices/${encodeURIComponent(invoice.invoiceId)}`}
                            >
                              <strong>
                                {invoice.invoiceNumber ?? "Draft invoice"}
                              </strong>
                            </Link>
                            <small className="table-sub">
                              {invoice.serviceCategoryName}
                            </small>
                          </td>
                          <td>
                            {invoice.customerName}
                            <small className="table-sub">
                              {invoice.guestDisplayText}
                            </small>
                          </td>
                          <td>
                            {invoice.invoiceDate}
                            <small className="table-sub">
                              Due {invoice.dueDate ?? "Not set"}
                            </small>
                          </td>
                          <td className="money numeric">
                            {formatINR(invoice.grandTotal)}
                          </td>
                          <td className="money numeric">
                            {invoice.status === "ISSUED"
                              ? formatINR(invoice.dueAmount)
                              : "—"}
                          </td>
                          <td>
                            <StatusBadge value={invoice.status} />
                            {invoice.status === "ISSUED" && (
                              <small className="table-sub">
                                <StatusBadge value={invoice.paymentStatus} />
                              </small>
                            )}
                          </td>
                          <td>
                            <Link
                              className="button button-ghost"
                              href={`/invoices/${encodeURIComponent(invoice.invoiceId)}${invoice.status === "DRAFT" && can(role, "billing") ? "/edit" : ""}`}
                            >
                              {invoice.status === "DRAFT" &&
                              can(role, "billing")
                                ? "Edit draft"
                                : "View invoice"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <ReportPagination
              pagination={list.data.pagination}
              update={state.update}
            />
          </>
        )
      )}
    </>
  );
}
