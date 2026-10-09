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
import type { SettlementDiscountRow, SettlementSummary } from "./contracts";
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
  formatTimestamp,
  humanize,
  selectReportParams,
  shortId,
  useReport,
  useReportParams,
  validRange,
  type PrintColumn,
} from "./report-shared";

const allowed = [
  "from",
  "to",
  "companyId",
  "customerId",
  "customerCategory",
  "serviceCategoryId",
  "q",
  "status",
  "creatorId",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
] as const;
const sorts = [
  "date",
  "amount",
  "invoiceNumber",
  "customer",
  "customerCategory",
  "creator",
  "reversedAt",
] as const;

const valueOrDash = (value: string | null | undefined) => value || "—";
const settlementPrintColumns: Array<PrintColumn<SettlementDiscountRow>> = [
  { label: "Date", value: (row) => valueOrDash(row.date) },
  { label: "Invoice Date", value: (row) => valueOrDash(row.invoiceDate) },
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
  { label: "Reason", value: (row) => valueOrDash(row.reason), wrap: true },
  { label: "Status", value: (row) => humanize(row.status) },
  {
    label: "Settlement Discount",
    value: (row) => formatINR(row.amount),
    numeric: true,
  },
  {
    label: "Invoice Grand Total",
    value: (row) => formatINR(row.invoiceGrandTotal),
    numeric: true,
  },
  {
    label: "Current Due Amount",
    value: (row) => formatINR(row.currentDueAmount),
    numeric: true,
  },
  { label: "Reversed At", value: (row) => formatTimestamp(row.reversedAt) },
  {
    label: "Reversal Reason",
    value: (row) => valueOrDash(row.reversalReason),
    wrap: true,
  },
];

export function SettlementDiscountsPage({
  canPrint = true,
}: {
  canPrint?: boolean;
}) {
  const state = useReportParams();
  const params = selectReportParams(state.params, allowed, sorts);
  const report = useReport<SettlementDiscountRow, SettlementSummary>(
    "/reports/settlement-discounts",
    params,
    validRange(params),
  );
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Core reports · Adjustment date</p>
          <h1>Settlement Discounts</h1>
          <p>
            Commercial settlement discounts are shown separately from cash
            receipts, invoice-line discounts and tax corrections.
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv
            path="/reports/settlement-discounts/export"
            params={params}
          />
          {report.data && (
            <PrintReportAction
              title="Settlement Discounts"
              params={params}
              meta={report.data.meta}
              rows={report.data.data}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={settlementPrintColumns}
              authorized={canPrint}
              reportBusy={report.isFetching}
              summary={[
                {
                  label: "Settlement Discounts",
                  value: report.data.summary.total,
                },
                {
                  label: "Active Count",
                  value: report.data.summary.activeCount,
                },
                {
                  label: "Active Amount",
                  value: formatINR(report.data.summary.activeAmount),
                },
                {
                  label: "Reversed Count",
                  value: report.data.summary.reversedCount,
                },
                {
                  label: "Reversed Amount",
                  value: formatINR(report.data.summary.reversedAmount),
                },
              ]}
            />
          )}
        </div>
      </header>
      <CommonFilters params={params} setFilter={state.setFilter}>
        <Field label="Status">
          <Select
            value={params.status ?? ""}
            onChange={(e) => state.setFilter("status", e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="REVERSED">Reversed</option>
          </Select>
        </Field>
        <MasterPicker
          resource="users"
          label="Creators"
          value={params.creatorId ?? ""}
          onChange={(value) => state.setFilter("creatorId", value)}
        />
      </CommonFilters>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {report.isLoading ? (
        <Loading label="Loading settlement discounts" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          <SummaryCards
            items={[
              {
                label: "Settlement discounts",
                value: report.data.summary.total,
              },
              {
                label: "Active amount",
                value: formatINR(report.data.summary.activeAmount),
                hint: `${report.data.summary.activeCount} active`,
              },
              {
                label: "Reversed amount",
                value: formatINR(report.data.summary.reversedAmount),
                hint: `${report.data.summary.reversedCount} reversed`,
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
              title="No settlement discounts"
              detail="No settlement discounts match the active filters."
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
                          label="Date"
                          value="date"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>Invoice / customer</th>
                      <th>Reason</th>
                      <th>Creator</th>
                      <th>Status</th>
                      <th className="numeric">
                        <SortHeader
                          label="Settlement discount"
                          value="amount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">Current due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.data.map((row) => (
                      <tr key={row.adjustmentId}>
                        <td>
                          {row.date}
                          <small className="table-sub">
                            Created {formatTimestamp(row.createdAt)}
                          </small>
                        </td>
                        <td>
                          <Link
                            className="text-link"
                            href={recordHref("invoice-detail", row.invoiceId)}
                          >
                            {row.invoiceNumber ?? "Draft"}
                          </Link>
                          <small className="table-sub">
                            {row.customerName} · {row.customerCategory}
                          </small>
                        </td>
                        <td>
                          {row.reason}
                          {row.reversalReason && (
                            <small className="table-sub">
                              Reversal: {row.reversalReason}
                            </small>
                          )}
                        </td>
                        <td title={row.createdBy}>{shortId(row.createdBy)}</td>
                        <td>
                          <StatusBadge value={row.status} />
                          {row.reversedAt && (
                            <small className="table-sub">
                              {formatTimestamp(row.reversedAt)}
                            </small>
                          )}
                        </td>
                        <td className="money numeric">
                          {formatINR(row.amount)}
                        </td>
                        <td className="money numeric due-text">
                          {formatINR(row.currentDueAmount)}
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
