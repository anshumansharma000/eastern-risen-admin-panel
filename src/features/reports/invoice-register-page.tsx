"use client";

import { recordHref } from "@/lib/routes";

import { Button as ClearFiltersButton } from "@/components/ui";
import Link from "next/link";
import {
  Empty,
  ErrorState,
  Field,
  Loading,
  Select,
  StatusBadge,
} from "@/components/ui";
import { formatINR } from "@/lib/money";
import type { InvoiceReportRow, InvoiceSummary } from "./contracts";
import {
  ActiveFilters,
  CommonFilters,
  DateRangeError,
  ExportCsv,
  MasterPicker,
  PrintReportAction,
  ReportMetaLine,
  ReportPagination,
  SortHeader,
  SummaryCards,
  selectReportParams,
  shortId,
  useReport,
  useReportParams,
  validRange,
  humanize,
  type PrintColumn,
} from "./report-shared";

const allowed = [
  "from",
  "to",
  "companyId",
  "customerId",
  "customerCategory",
  "serviceCategoryId",
  "vehicleId",
  "q",
  "status",
  "paymentStatus",
  "financialYear",
  "hasVehicle",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
] as const;
const sorts = [
  "invoiceDate",
  "invoiceNumber",
  "customer",
  "customerCategory",
  "serviceCategory",
  "vehicle",
  "status",
  "subtotal",
  "taxTotal",
  "grandTotal",
  "receivedAmount",
  "adjustmentAmount",
  "dueAmount",
  "dueDate",
] as const;

const valueOrDash = (value: string | null | undefined) => value || "—";
const invoicePrintColumns: Array<PrintColumn<InvoiceReportRow>> = [
  { label: "Invoice Date", value: (row) => valueOrDash(row.invoiceDate) },
  { label: "Financial Year", value: (row) => valueOrDash(row.financialYear) },
  { label: "Invoice Number", value: (row) => valueOrDash(row.invoiceNumber) },
  { label: "Invoice Status", value: (row) => humanize(row.status) },
  {
    label: "Company",
    value: (row) => valueOrDash(row.companyName),
    wrap: true,
  },
  {
    label: "Customer",
    value: (row) => valueOrDash(row.customerName),
    wrap: true,
  },
  {
    label: "Customer Category",
    value: (row) => humanize(row.customerCategory),
  },
  {
    label: "Service Category",
    value: (row) => valueOrDash(row.serviceCategoryName),
    wrap: true,
  },
  {
    label: "Vehicle Registration Number",
    value: (row) => valueOrDash(row.vehicleRegistrationNumber),
  },
  {
    label: "Vehicle Name",
    value: (row) => valueOrDash(row.vehicleName),
    wrap: true,
  },
  { label: "Vehicle Type", value: (row) => valueOrDash(row.vehicleType) },
  {
    label: "Guest",
    value: (row) => valueOrDash(row.guestDisplayText),
    wrap: true,
  },
  { label: "Due Date", value: (row) => valueOrDash(row.dueDate) },
  { label: "Subtotal", value: (row) => formatINR(row.subtotal), numeric: true },
  {
    label: "Tax Total",
    value: (row) => formatINR(row.taxTotal),
    numeric: true,
  },
  {
    label: "Grand Total",
    value: (row) => formatINR(row.grandTotal),
    numeric: true,
  },
  {
    label: "Received Amount",
    value: (row) => formatINR(row.receivedAmount),
    numeric: true,
  },
  {
    label: "Settlement Discount",
    value: (row) => formatINR(row.adjustmentAmount),
    numeric: true,
  },
  {
    label: "Due Amount",
    value: (row) => formatINR(row.dueAmount),
    numeric: true,
  },
  { label: "Payment Status", value: (row) => humanize(row.paymentStatus) },
  {
    label: "Cancellation Reason",
    value: (row) => valueOrDash(row.cancellationReason),
    wrap: true,
  },
];

export function InvoiceRegisterPage({
  canPrint = true,
}: {
  canPrint?: boolean;
}) {
  const state = useReportParams();
  const params = selectReportParams(state.params, allowed, sorts);
  const report = useReport<InvoiceReportRow, InvoiceSummary>(
    "/reports/invoices",
    params,
    validRange(params),
  );
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Core reports · Invoice date</p>
          <h1>Invoice Register</h1>
          <p>
            Server-filtered invoice documents and their complete filtered
            financial summary.
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv path="/reports/invoices/export" params={params} />
          {report.data && (
            <PrintReportAction
              title="Invoice Register"
              params={params}
              meta={report.data.meta}
              rows={report.data.data}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={invoicePrintColumns}
              authorized={canPrint}
              reportBusy={report.isFetching}
              summary={[
                { label: "Invoices", value: report.data.summary.total },
                { label: "Draft", value: report.data.summary.draftCount },
                { label: "Issued", value: report.data.summary.issuedCount },
                {
                  label: "Cancelled",
                  value: report.data.summary.cancelledCount,
                },
                {
                  label: "Subtotal",
                  value: formatINR(report.data.summary.subtotal),
                },
                {
                  label: "Tax Total",
                  value: formatINR(report.data.summary.taxTotal),
                },
                {
                  label: "Grand Total",
                  value: formatINR(report.data.summary.grandTotal),
                },
                {
                  label: "Received Amount",
                  value: formatINR(report.data.summary.receivedAmount),
                },
                {
                  label: "Settlement Discount",
                  value: formatINR(report.data.summary.adjustmentAmount),
                },
                {
                  label: "Due Amount",
                  value: formatINR(report.data.summary.dueAmount),
                },
              ]}
            />
          )}
        </div>
      </header>
      <CommonFilters params={params} setFilter={state.setFilter}>
        <MasterPicker
          resource="vehicles"
          label="Vehicles"
          value={params.vehicleId ?? ""}
          onChange={(value) => state.setFilter("vehicleId", value)}
        />
        <Field label="Invoice status">
          <Select
            value={params.status ?? ""}
            onChange={(event) => state.setFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        <Field label="Payment status">
          <Select
            value={params.paymentStatus ?? ""}
            onChange={(event) =>
              state.setFilter("paymentStatus", event.target.value)
            }
          >
            <option value="">All statuses</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
          </Select>
        </Field>
        <Field label="Financial year">
          <input
            className="input"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={params.financialYear ?? ""}
            onChange={(event) =>
              state.setFilter("financialYear", event.target.value)
            }
            placeholder="2627"
          />
        </Field>
        <Field label="Vehicle assignment">
          <Select
            value={params.hasVehicle ?? ""}
            onChange={(event) =>
              state.setFilter("hasVehicle", event.target.value)
            }
          >
            <option value="">Any</option>
            <option value="true">Assigned</option>
            <option value="false">Unassigned</option>
          </Select>
        </Field>
      </CommonFilters>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {report.isLoading ? (
        <Loading label="Loading invoice register" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          <SummaryCards
            items={[
              {
                label: "Invoices",
                value: report.data.summary.total,
                hint: `${report.data.summary.issuedCount} issued · ${report.data.summary.draftCount} drafts · ${report.data.summary.cancelledCount} cancelled`,
              },
              {
                label: "Grand total",
                value: formatINR(report.data.summary.grandTotal),
              },
              {
                label: "Cash received",
                value: formatINR(report.data.summary.receivedAmount),
                tone: "success",
              },
              {
                label: "Settlement discounts",
                value: formatINR(report.data.summary.adjustmentAmount),
              },
              {
                label: "Due now",
                value: formatINR(report.data.summary.dueAmount),
                tone: "danger",
              },
            ]}
          />
          {!report.data.data.length ? (
            <Empty
              action={
                <ClearFiltersButton variant="secondary" onClick={state.clear}>
                  Clear filters
                </ClearFiltersButton>
              }
              title="No invoice results"
              detail={
                Object.keys(params).length > 2
                  ? "No invoices match the active filters. Clear filters to broaden the report."
                  : "No invoice records exist yet."
              }
            />
          ) : (
            <section
              className={`table-card ${report.isFetching ? "is-busy" : ""}`}
              aria-busy={report.isFetching}
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <SortHeader
                          label="Invoice"
                          value="invoiceNumber"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>
                        <SortHeader
                          label="Date"
                          value="invoiceDate"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>
                        <SortHeader
                          label="Customer"
                          value="customer"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>Service / vehicle</th>
                      <th>Status</th>
                      <th className="numeric">
                        <SortHeader
                          label="Grand total"
                          value="grandTotal"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Cash received"
                          value="receivedAmount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Settlement discount"
                          value="adjustmentAmount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Due"
                          value="dueAmount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.data.map((row) => (
                      <tr
                        key={row.invoiceId}
                        className={`report-row-${row.status.toLowerCase()}`}
                      >
                        <td>
                          <Link
                            className="text-link"
                            href={recordHref("invoice-detail", row.invoiceId)}
                          >
                            <strong>
                              {row.invoiceNumber ??
                                `Draft ${shortId(row.invoiceId)}`}
                            </strong>
                          </Link>
                          <small className="table-sub">
                            {row.financialYear ?? "—"}
                          </small>
                        </td>
                        <td>
                          {row.invoiceDate}
                          <small className="table-sub">
                            Due {row.dueDate ?? "—"}
                          </small>
                        </td>
                        <td>
                          <strong>{row.customerName}</strong>
                          <small className="table-sub">
                            {row.customerCategory} · {row.companyName}
                          </small>
                        </td>
                        <td>
                          {row.serviceCategoryName}
                          <small className="table-sub">
                            {row.vehicleRegistrationNumber
                              ? `${row.vehicleRegistrationNumber}${row.vehicleName ? ` · ${row.vehicleName}` : ""}`
                              : "—"}
                          </small>
                        </td>
                        <td>
                          <StatusBadge value={row.status} />
                          <small className="table-sub">
                            <StatusBadge value={row.paymentStatus} />
                          </small>
                        </td>
                        <td className="money numeric">
                          {formatINR(row.grandTotal)}
                        </td>
                        <td className="money numeric success-text">
                          {formatINR(row.receivedAmount)}
                        </td>
                        <td className="money numeric">
                          {formatINR(row.adjustmentAmount)}
                        </td>
                        <td className="money numeric due-text">
                          {formatINR(row.dueAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ReportPagination
                pagination={report.data.pagination}
                update={state.update}
              />
            </section>
          )}
        </>
      ) : null}
      {report.data && !report.data.data.length && (
        <ReportPagination
          pagination={report.data.pagination}
          update={state.update}
        />
      )}
    </>
  );
}
