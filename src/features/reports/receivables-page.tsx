"use client";

import { recordHref } from "@/lib/routes";

import { Button as ClearFiltersButton } from "@/components/ui";
import Link from "next/link";
import {
  Checkbox,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
} from "@/components/ui";
import { formatINR } from "@/lib/money";
import type {
  AgeingBucket,
  ReceivableReportRow,
  ReceivableSummary,
} from "./contracts";
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
  humanize,
  selectReportParams,
  type PrintColumn,
  useReport,
  useReportParams,
  validRange,
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
  "paymentStatus",
  "ageingBucket",
  "overdueOnly",
  "dueFrom",
  "dueTo",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
] as const;
const sorts = [
  "invoiceDate",
  "dueDate",
  "daysOverdue",
  "invoiceNumber",
  "customer",
  "customerCategory",
  "serviceCategory",
  "vehicle",
  "grandTotal",
  "receivedAmount",
  "adjustmentAmount",
  "dueAmount",
] as const;
const bucketLabels: Record<AgeingBucket, string> = {
  NOT_DUE: "Not due",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_PLUS": "90+ days",
  NO_DUE_DATE: "No due date",
};

const valueOrDash = (value: string | null | undefined) => value || "—";
const receivablesPrintColumns: Array<PrintColumn<ReceivableReportRow>> = [
  { label: "Invoice Date", value: (row) => valueOrDash(row.invoiceDate) },
  { label: "Financial Year", value: (row) => valueOrDash(row.financialYear) },
  { label: "Invoice Number", value: (row) => valueOrDash(row.invoiceNumber) },
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
  {
    label: "Days Overdue",
    value: (row) => row.daysOverdue ?? "—",
    numeric: true,
  },
  { label: "Ageing Bucket", value: (row) => bucketLabels[row.ageingBucket] },
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
    label: "Latest Payment Date",
    value: (row) => valueOrDash(row.latestPaymentDate),
  },
];

export function ReceivablesPage({ canPrint = true }: { canPrint?: boolean }) {
  const state = useReportParams();
  const params = selectReportParams(state.params, allowed, sorts);
  const valid =
    validRange(params) &&
    (!params.dueFrom || !params.dueTo || params.dueTo >= params.dueFrom);
  const report = useReport<ReceivableReportRow, ReceivableSummary>(
    "/reports/receivables",
    params,
    valid,
  );
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">
            Core reports · Invoice date · Current balances
          </p>
          <h1>Payment Due / Receivables</h1>
          <p>
            Current issued-invoice balances, ageing and settlement composition.
            No historical as-of reconstruction is applied.
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv path="/reports/receivables/export" params={params} />
          {report.data && (
            <PrintReportAction
              title="Payment Due / Receivables"
              params={params}
              meta={report.data.meta}
              rows={report.data.data}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={receivablesPrintColumns}
              authorized={canPrint}
              reportBusy={report.isFetching}
              summary={[
                { label: "Invoices", value: report.data.summary.total },
                {
                  label: "Issued Gross",
                  value: formatINR(report.data.summary.grandTotal),
                },
                {
                  label: "Cash Received",
                  value: formatINR(report.data.summary.receivedAmount),
                },
                {
                  label: "Settlement Discounts",
                  value: formatINR(report.data.summary.adjustmentAmount),
                },
                {
                  label: "Due Now",
                  value: formatINR(report.data.summary.dueAmount),
                },
                ...report.data.summary.ageing.map((bucket) => ({
                  label: `${bucketLabels[bucket.ageingBucket]} Due`,
                  value: `${formatINR(bucket.dueAmount)} · ${bucket.outstandingInvoiceCount} unpaid`,
                })),
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
        <Field label="Payment status">
          <Select
            value={params.paymentStatus ?? ""}
            onChange={(e) => state.setFilter("paymentStatus", e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
          </Select>
        </Field>
        <Field label="Due from">
          <Input
            type="date"
            value={params.dueFrom ?? ""}
            max={params.dueTo || undefined}
            onChange={(e) => state.setFilter("dueFrom", e.target.value)}
          />
        </Field>
        <Field label="Due to">
          <Input
            type="date"
            value={params.dueTo ?? ""}
            min={params.dueFrom || undefined}
            onChange={(e) => state.setFilter("dueTo", e.target.value)}
          />
        </Field>
        <label className="field">
          <span>Due state</span>
          <span className="checkbox-row">
            <Checkbox
              checked={params.overdueOnly === "true"}
              onChange={(e) =>
                state.setFilter("overdueOnly", e.target.checked ? "true" : "")
              }
            />{" "}
            Overdue only
          </span>
        </label>
      </CommonFilters>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {!valid && validRange(params) && (
        <div className="error-panel" role="alert">
          <strong>
            The due-to date must be on or after the due-from date.
          </strong>
        </div>
      )}
      {report.isLoading ? (
        <Loading label="Loading receivables" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          <SummaryCards
            items={[
              {
                label: "Issued gross",
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
          <section className="ageing-grid" aria-label="Receivables ageing">
            {report.data.summary.ageing.map((bucket) => (
              <button
                type="button"
                key={bucket.ageingBucket}
                className={
                  params.ageingBucket === bucket.ageingBucket ? "active" : ""
                }
                onClick={() =>
                  state.setFilter(
                    "ageingBucket",
                    params.ageingBucket === bucket.ageingBucket
                      ? ""
                      : bucket.ageingBucket,
                  )
                }
              >
                <span>{bucketLabels[bucket.ageingBucket]}</span>
                <strong>{formatINR(bucket.dueAmount)}</strong>
                <small>{bucket.outstandingInvoiceCount} unpaid invoices</small>
              </button>
            ))}
          </section>
          {!report.data.data.length ? (
            <Empty
              action={
                <ClearFiltersButton variant="secondary" onClick={state.clear}>
                  Clear filters
                </ClearFiltersButton>
              }
              title="No receivable results"
              detail="No issued invoices match the active current-balance filters."
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
                          label="Customer"
                          value="customer"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>Service / vehicle</th>
                      <th>
                        <SortHeader
                          label="Due date"
                          value="dueDate"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>Ageing</th>
                      <th className="numeric">
                        <SortHeader
                          label="Gross"
                          value="grandTotal"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Cash"
                          value="receivedAmount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">Settlement discount</th>
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
                      <tr key={row.invoiceId}>
                        <td>
                          <Link
                            className="text-link"
                            href={recordHref("invoice-detail", row.invoiceId)}
                          >
                            {row.invoiceNumber ?? "—"}
                          </Link>
                          <small className="table-sub">{row.invoiceDate}</small>
                        </td>
                        <td>
                          <Link
                            className="text-link"
                            href={recordHref(
                              "customer-statement",
                              row.customerId,
                            )}
                          >
                            {row.customerName}
                          </Link>
                          <small className="table-sub">
                            {row.customerCategory}
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
                          {row.dueDate ?? "—"}
                          <small className="table-sub">
                            Last payment {row.latestPaymentDate ?? "—"}
                          </small>
                        </td>
                        <td>
                          {bucketLabels[row.ageingBucket]}
                          <small className="table-sub">
                            {row.daysOverdue === null
                              ? "—"
                              : `${row.daysOverdue} days overdue`}
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
                          <strong>{formatINR(row.dueAmount)}</strong>
                          <small className="table-sub">
                            <StatusBadge value={row.paymentStatus} />
                          </small>
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
