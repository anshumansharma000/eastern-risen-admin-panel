"use client";

import { recordHref } from "@/lib/routes";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Checkbox,
  Empty,
  ErrorState,
  Field,
  Loading,
  Select,
  StatusBadge,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { CoreRole } from "@/lib/api/contracts";
import {
  PaymentReviewDialog,
  ResolutionHistory,
} from "@/features/payment-review/payment-review-dialog";
import { reasonLabels } from "@/features/payment-review/labels";
import { formatINR } from "@/lib/money";
import type { PaymentReportRow, PaymentSummary } from "./contracts";
import {
  ActiveFilters,
  CommonFilters,
  DateRangeError,
  ExportCsv,
  PrintReportAction,
  ReportMetaLine,
  ReportPagination,
  SearchFilter,
  SortHeader,
  SummaryCards,
  formatTimestamp,
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
  "q",
  "source",
  "receiptStatus",
  "gatewayStatus",
  "needsReview",
  "method",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
] as const;
const sorts = [
  "activityAt",
  "createdAt",
  "receivedDate",
  "paidAt",
  "amount",
  "source",
  "method",
  "receiptStatus",
  "gatewayStatus",
  "receiptNumber",
  "providerOrderId",
  "invoiceNumber",
  "bookingReference",
  "customer",
] as const;
const sources = ["MANUAL", "GATEWAY"] as const;
const receiptStatuses = ["PENDING", "CONFIRMED", "REVERSED"] as const;
const gatewayStatuses = [
  "CREATING",
  "READY",
  "PAID",
  "EXPIRED",
  "TERMINATED",
  "REVIEW_REQUIRED",
  "REFUNDED",
] as const;
const methods = ["CASH", "CHEQUE", "DD", "CARD", "UPI", "GATEWAY"] as const;
const dash = (value: string | null | undefined) => value || "—";
const sourceLabel = (row: PaymentReportRow) =>
  row.source === "GATEWAY" ? "Gateway" : "Manual / unlinked receipt";
const hasReviewFunds = (row: PaymentReportRow) =>
  /[1-9]/.test(row.providerConfirmedReviewAmount);

export function paymentReportParams(values: Record<string, string>) {
  const params = selectReportParams(values, allowed, sorts);
  const pageSize = Number(values.pageSize ?? 25);
  params.pageSize = String(
    Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100
      ? pageSize
      : 25,
  );
  for (const [key, options] of Object.entries({
    source: sources,
    receiptStatus: receiptStatuses,
    gatewayStatus: gatewayStatuses,
    method: methods,
    customerCategory: ["AGENT", "LEISURE", "CORPORATE"],
  })) {
    if (params[key] && !(options as readonly string[]).includes(params[key]))
      delete params[key];
  }
  if (params.needsReview !== "true") delete params.needsReview;
  if (params.q) {
    params.q = params.q.trim().slice(0, 200);
    if (!params.q) delete params.q;
  }
  if (Number(params.page) > 1_000_000) params.page = "1";
  return params;
}

const paymentPrintColumns: Array<PrintColumn<PaymentReportRow>> = [
  { label: "Activity date", value: (row) => row.reportDate },
  { label: "Source", value: sourceLabel },
  { label: "Customer", value: (row) => dash(row.customerName), wrap: true },
  { label: "Company", value: (row) => dash(row.companyName), wrap: true },
  { label: "Booking", value: (row) => dash(row.bookingReference) },
  { label: "Invoice", value: (row) => dash(row.invoiceNumber) },
  { label: "Receipt", value: (row) => dash(row.receiptNumber) },
  { label: "Method", value: (row) => dash(row.method) },
  {
    label: "Receipt status",
    value: (row) => (row.receiptStatus ? humanize(row.receiptStatus) : "—"),
  },
  {
    label: "Gateway status",
    value: (row) => (row.gatewayStatus ? humanize(row.gatewayStatus) : "—"),
  },
  {
    label: "Face / receipt amount",
    value: (row) => formatINR(row.amount),
    numeric: true,
  },
  {
    label: "Linked receipt amount",
    value: (row) => formatINR(row.receiptAmount),
    numeric: true,
  },
  {
    label: "Verified funds awaiting review",
    value: (row) => formatINR(row.providerConfirmedReviewAmount),
    numeric: true,
  },
  { label: "Provider", value: (row) => dash(row.provider) },
  { label: "Provider status", value: (row) => dash(row.providerStatus) },
  {
    label: "Recorded external refunds (staff attestation)",
    value: (row) => formatINR(row.recordedExternalRefundAmount),
    numeric: true,
  },
  {
    label: "Provider order",
    value: (row) => dash(row.providerOrderId),
    wrap: true,
  },
  {
    label: "Provider payment",
    value: (row) => dash(row.providerPaymentId),
    wrap: true,
  },
  {
    label: "Receipt details",
    value: (row) =>
      Object.entries(row.details)
        .map(([key, value]) => `${humanize(key)}: ${value}`)
        .join(" · ") || "—",
    wrap: true,
  },
  {
    label: "Reversal reason",
    value: (row) => dash(row.reversalReason),
    wrap: true,
  },
  {
    label: "Attempts",
    value: (row) =>
      row.attempts
        .map(
          (a) =>
            `${dash(a.providerPaymentId)} · ${humanize(a.status)} · ${humanize(a.accountingStatus)} · ${a.currency} ${a.amount} · ${formatTimestamp(a.initiatedAt)} → ${formatTimestamp(a.completedAt)}`,
        )
        .join("; ") || "No attempts",
    wrap: true,
  },
];

function summaryItems(summary: PaymentSummary) {
  return [
    {
      label: "Payment records",
      value: summary.total,
      hint: `${summary.manualCount} manual · ${summary.gatewayCount} gateway`,
    },
    {
      label: "Confirmed receipts",
      value: formatINR(summary.confirmedReceiptAmount),
      hint: `${summary.confirmedReceiptCount} receipts`,
      tone: "success",
    },
    {
      label: "Pending receipts",
      value: formatINR(summary.pendingReceiptAmount),
      hint: `${summary.pendingReceiptCount} receipts; awaiting confirmation`,
    },
    {
      label: "Reversed receipts",
      value: formatINR(summary.reversedReceiptAmount),
      hint: `${summary.reversedReceiptCount} receipts; original amounts`,
      tone: "danger",
    },
    {
      label: "Verified funds awaiting review",
      value: formatINR(summary.providerConfirmedReviewAmount),
      hint: "Includes additional successful attempts on paid orders",
      tone: "danger",
    },
    {
      label: "Recorded external refunds",
      value: formatINR(summary.recordedExternalRefundAmount),
      hint: "INR only · administrator staff attestation",
    },
  ];
}

export function PaymentsReceivedPage({
  canPrint = true,
  role = "CORE_REPORT_VIEWER",
}: {
  canPrint?: boolean;
  role?: CoreRole;
}) {
  const state = useReportParams();
  const params = paymentReportParams(state.params);
  const sortParams = {
    ...params,
    sortBy: params.sortBy ?? "activityAt",
    sortOrder: params.sortOrder ?? "desc",
  };
  const report = useReport<PaymentReportRow, PaymentSummary>(
    "/reports/payments",
    params,
    validRange(params),
  );
  const paymentScroll = useRef<HTMLDivElement>(null);
  const [showExtraColumns, setShowExtraColumns] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const unavailable =
    report.error instanceof ApiError &&
    [404, 405, 501].includes(report.error.status);
  const sort = (label: string, value: string) => (
    <SortHeader
      label={label}
      value={value}
      params={sortParams}
      update={state.update}
    />
  );
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">
            Core reports · Payment activity · India time
          </p>
          <h1>Payments</h1>
          <p>
            All manual receipts and gateway orders, including payments without
            receipts and funds awaiting review.
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv path="/reports/payments/export" params={params} />
          {report.data && (
            <PrintReportAction
              title="Payments"
              params={params}
              meta={report.data.meta}
              rows={report.data.data}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={paymentPrintColumns}
              authorized={canPrint}
              reportBusy={report.isFetching}
              summary={[
                ...summaryItems(report.data.summary),
                {
                  label: "Manual records",
                  value: report.data.summary.manualCount,
                },
                {
                  label: "Gateway records",
                  value: report.data.summary.gatewayCount,
                },
                ...report.data.summary.gatewayStatusBreakdown.map((item) => ({
                  label: `Gateway ${humanize(item.status)} · ${item.count} orders (face amounts)`,
                  value: formatINR(item.amount),
                })),
              ]}
            />
          )}
        </div>
      </header>
      <CommonFilters params={params} setFilter={state.setFilter} search={false}>
        <SearchFilter
          value={params.q ?? ""}
          onChange={(value) => state.setFilter("q", value)}
          maxLength={200}
        />
        <PaymentFilter
          label="Payment source"
          name="source"
          value={params.source}
          values={sources}
          all="All sources"
          setFilter={state.setFilter}
        />
        <PaymentFilter
          label="Receipt status"
          name="receiptStatus"
          value={params.receiptStatus}
          values={receiptStatuses}
          all="All receipt states"
          setFilter={state.setFilter}
        />
        <PaymentFilter
          label="Gateway status"
          name="gatewayStatus"
          value={params.gatewayStatus}
          values={gatewayStatuses}
          all="All gateway states"
          setFilter={state.setFilter}
        />
        <PaymentFilter
          label="Payment method"
          name="method"
          value={params.method}
          values={methods}
          all="All methods"
          setFilter={state.setFilter}
        />
        <Field label="Sort by">
          <Select
            value={sortParams.sortBy}
            onChange={(event) => state.setFilter("sortBy", event.target.value)}
          >
            {sorts.map((value) => (
              <option key={value} value={value}>
                {value === "activityAt" ? "Payment activity" : humanize(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sort order">
          <Select
            value={sortParams.sortOrder}
            onChange={(event) =>
              state.setFilter("sortOrder", event.target.value)
            }
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </Field>
      </CommonFilters>
      <p className="report-meta">
        Filters intersect. Receipt status and method exclude orders without
        receipts; gateway status excludes manual records.
      </p>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {!validRange(params) ? null : report.isLoading ? (
        <Loading label="Loading payments" />
      ) : report.isError ? (
        <>
          {unavailable && (
            <p className="error-panel" role="alert">
              The unified payments report is unavailable on this backend. Deploy
              the updated payments report API and migration, then retry.
            </p>
          )}
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        </>
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          {report.isFetching && (
            <p role="status" className="report-meta">
              Updating payments…
            </p>
          )}
          <SummaryCards items={summaryItems(report.data.summary)} />
          <details
            className="payment-gateway-summary"
            aria-label="Gateway order summary"
          >
            <summary>Gateway orders by state</summary>
            <p className="report-meta">
              Amounts are order face amounts. Gateway and receipt summaries
              overlap and must not be added together. A receipt reversal does
              not establish a gateway refund.
            </p>
            {report.data.summary.gatewayStatusBreakdown.length ? (
              <SummaryCards
                items={report.data.summary.gatewayStatusBreakdown.map(
                  (item) => ({
                    label: humanize(item.status),
                    value: formatINR(item.amount),
                    hint: `${item.count} orders · face amounts`,
                  }),
                )}
              />
            ) : (
              <p className="report-meta">
                No gateway orders match these filters.
              </p>
            )}
          </details>
          {!report.data.data.length && (
            <Empty
              action={
                <Button variant="secondary" onClick={state.clear}>
                  Clear filters
                </Button>
              }
              title="No payment results"
              detail="No payment records on this page match the selected filters. Clear filters or return to the first page."
            />
          )}
          <div className="table-options">
            <Button
              variant="secondary"
              onClick={() =>
                state.update({
                  needsReview: true,
                  gatewayStatus: null,
                  source: "GATEWAY",
                  receiptStatus: null,
                  method: null,
                  page: null,
                })
              }
            >
              Payments requiring review
            </Button>
            <label className="checkbox-row">
              <Checkbox
                checked={showExtraColumns}
                onChange={(event) => setShowExtraColumns(event.target.checked)}
              />{" "}
              Show method, receipt and company columns
            </label>
          </div>
          <section
            className={`table-card ${report.isFetching ? "is-busy" : ""}`}
            aria-label="Payment records"
            aria-busy={report.isFetching}
          >
            {!!report.data.data.length && (
              <>
                <div className="payment-table-toolbar">
                  <span>Scroll horizontally to view all payment fields.</span>
                  <div>
                    <Button
                      variant="ghost"
                      aria-label="Scroll payments left"
                      onClick={() =>
                        paymentScroll.current?.scrollBy({
                          left: -400,
                          behavior: "smooth",
                        })
                      }
                    >
                      ←
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label="Scroll payments right"
                      onClick={() =>
                        paymentScroll.current?.scrollBy({
                          left: 400,
                          behavior: "smooth",
                        })
                      }
                    >
                      →
                    </Button>
                  </div>
                </div>
                <div
                  ref={paymentScroll}
                  className="table-scroll payment-table-scroll"
                  role="region"
                  aria-label="Scrollable payments table"
                  tabIndex={0}
                >
                  <table
                    className={`payments-table ${showExtraColumns ? "" : "compact"}`}
                  >
                    <thead>
                      <tr>
                        <th>{sort("Activity date", "activityAt")}</th>
                        <th>{sort("Customer", "customer")}</th>
                        <th className="numeric">{sort("Amount", "amount")}</th>
                        <th>{sort("Source", "source")}</th>
                        <th>{sort("Gateway status", "gatewayStatus")}</th>
                        <th>{sort("Receipt status", "receiptStatus")}</th>
                        <th>Booking / invoice</th>
                        <th>{sort("Method", "method")}</th>
                        <th>{sort("Receipt", "receiptNumber")}</th>
                        <th>Company</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.data.data.map((row) => (
                        <Fragment key={row.id}>
                          <tr>
                            <td>
                              {row.reportDate}
                              <small className="table-sub">
                                {formatTimestamp(row.activityAt)}
                              </small>
                            </td>
                            <td>
                              {dash(row.customerName)}
                              <small className="table-sub">
                                {row.customerCategory
                                  ? humanize(row.customerCategory)
                                  : "—"}
                              </small>
                            </td>
                            <td className="money numeric">
                              {formatINR(row.amount)}
                              <small className="table-sub">
                                {row.source === "GATEWAY"
                                  ? "Order face amount"
                                  : "Receipt amount"}
                              </small>
                            </td>
                            <td>
                              {sourceLabel(row)}
                              {row.provider && (
                                <small className="table-sub">
                                  {row.provider}
                                </small>
                              )}
                            </td>
                            <td>
                              <PaymentStatus
                                kind="Gateway"
                                value={row.gatewayStatus}
                              />
                              {row.needsReview && (
                                <small className="table-sub payment-review">
                                  Requires review
                                </small>
                              )}
                              <small className="table-sub">
                                Provider status: {dash(row.providerStatus)}
                              </small>
                              {row.attempts.some(
                                (a) => a.accountingStatus === "REVIEW_REQUIRED",
                              ) && (
                                <small className="table-sub payment-review">
                                  Unresolved payment attempt
                                </small>
                              )}
                              {hasReviewFunds(row) && (
                                <small className="table-sub payment-review">
                                  {formatINR(row.providerConfirmedReviewAmount)}{" "}
                                  verified funds awaiting review
                                </small>
                              )}
                            </td>
                            <td>
                              <PaymentStatus
                                kind="Receipt"
                                value={row.receiptStatus}
                              />
                              {row.attempts.some(
                                (a) =>
                                  a.receiptAccountingState ===
                                  "REVERSED_WITHOUT_REFUND",
                              ) && (
                                <small className="table-sub payment-review">
                                  Reversed without a recorded refund
                                </small>
                              )}
                            </td>
                            <td>
                              {row.bookingId ? (
                                <Link
                                  className="text-link"
                                  href={recordHref(
                                    "commercial-detail",
                                    row.bookingId,
                                  )}
                                >
                                  {row.bookingReference || "View booking"}
                                </Link>
                              ) : (
                                dash(row.bookingReference)
                              )}
                              <small className="table-sub">
                                {row.invoiceId ? (
                                  <Link
                                    className="text-link"
                                    href={recordHref(
                                      "invoice-detail",
                                      row.invoiceId,
                                    )}
                                  >
                                    {row.invoiceNumber || "View invoice"}
                                  </Link>
                                ) : (
                                  dash(row.invoiceNumber)
                                )}
                              </small>
                            </td>
                            <td>{dash(row.method)}</td>
                            <td>{dash(row.receiptNumber)}</td>
                            <td>
                              {dash(row.companyName)}
                              <small className="table-sub">
                                {dash(row.serviceCategoryName)}
                              </small>
                            </td>
                            <td>
                              {row.source === "GATEWAY" &&
                                row.paymentOrderId && (
                                  <Button
                                    variant="secondary"
                                    onClick={() =>
                                      setReviewOrderId(row.paymentOrderId)
                                    }
                                  >
                                    Review
                                  </Button>
                                )}
                              <Button
                                variant="ghost"
                                aria-expanded={expandedId === row.id}
                                aria-controls={`payment-details-${row.id}`}
                                onClick={() =>
                                  setExpandedId(
                                    expandedId === row.id ? null : row.id,
                                  )
                                }
                              >
                                {expandedId === row.id
                                  ? "Hide details"
                                  : "View details"}
                              </Button>
                            </td>
                          </tr>
                          {expandedId === row.id && (
                            <tr>
                              <td colSpan={11} className="payment-detail-cell">
                                <PaymentDetails row={row} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <ReportPagination
              pagination={report.data.pagination}
              update={state.update}
            />
          </section>
        </>
      ) : null}
      {reviewOrderId && (
        <PaymentReviewDialog
          key={reviewOrderId}
          orderId={reviewOrderId}
          role={role}
          onClose={() => setReviewOrderId(null)}
        />
      )}
    </>
  );
}

function PaymentFilter({
  label,
  name,
  value,
  values,
  all,
  setFilter,
}: {
  label: string;
  name: string;
  value?: string;
  values: readonly string[];
  all: string;
  setFilter: (key: string, value: string) => void;
}) {
  return (
    <Field label={label}>
      <Select
        value={value ?? ""}
        onChange={(e) => setFilter(name, e.target.value)}
      >
        <option value="">{all}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {humanize(option)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function PaymentStatus({
  kind,
  value,
}: {
  kind: "Receipt" | "Gateway";
  value: string | null;
}) {
  return value ? (
    <span aria-label={`${kind} ${humanize(value).toLowerCase()}`}>
      <StatusBadge value={value} />
    </span>
  ) : (
    <>—</>
  );
}

function PaymentDetails({ row }: { row: PaymentReportRow }) {
  const facts = [
    ["Company", dash(row.companyName)],
    ["Service", dash(row.serviceCategoryName)],
    ["Payment method", dash(row.method)],
    ["Provider", dash(row.provider)],
    ["Provider status", dash(row.providerStatus)],
    [
      "Recorded external refunds (staff attestation)",
      formatINR(row.recordedExternalRefundAmount),
    ],
    ["Provider order reference", dash(row.providerOrderId)],
    ["Provider payment reference", dash(row.providerPaymentId)],
    ["Receipt number", dash(row.receiptNumber)],
    ["Receipt amount", formatINR(row.receiptAmount)],
    ["Receipt date", dash(row.receivedDate)],
    ["Payment timestamp", formatTimestamp(row.paidAt)],
    ["Created", formatTimestamp(row.createdAt)],
    [
      "Verified funds awaiting review",
      formatINR(row.providerConfirmedReviewAmount),
    ],
    ["Reference", dash(row.details.reference)],
    ["Bank", dash(row.details.bankName)],
    ["Instrument date", dash(row.details.instrumentDate)],
    ["Card last four", dash(row.details.cardLastFour)],
    ["Reversal reason", dash(row.reversalReason)],
  ];
  return (
    <section
      id={`payment-details-${row.id}`}
      className="payment-details"
      aria-label="Payment details"
    >
      <h3>Payment details</h3>
      <dl className="payment-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {row.receiptStatus === "REVERSED" && (
        <p className="payment-review">
          The receipt was reversed. This does not establish that a gateway
          refund occurred.
        </p>
      )}
      <h3>Payment attempts</h3>
      {row.attempts.length ? (
        <div className="table-scroll">
          <table aria-label="Payment attempts">
            <thead>
              <tr>
                <th>Provider payment</th>
                <th>Attempt status</th>
                <th>Accounting status</th>
                <th>Amount / currency</th>
                <th>Receipt ID</th>
                <th>Initiated (India time)</th>
                <th>Completed (India time)</th>
              </tr>
            </thead>
            <tbody>
              {row.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>
                    {dash(attempt.providerPaymentId)}
                    <small className="table-sub">Attempt {attempt.id}</small>
                    {attempt.reviewReasons.map((r, index) => (
                      <small className="table-sub" key={index}>
                        {reasonLabels[r.code]}
                      </small>
                    ))}
                  </td>
                  <td>
                    <StatusBadge value={attempt.status} />
                  </td>
                  <td>
                    <StatusBadge value={attempt.accountingStatus} />
                    {attempt.receiptAccountingState && (
                      <small className="table-sub">
                        {humanize(attempt.receiptAccountingState)}
                      </small>
                    )}
                  </td>
                  <td>
                    {attempt.currency === "INR"
                      ? formatINR(attempt.amount)
                      : `${attempt.currency} ${attempt.amount}`}
                  </td>
                  <td>{dash(attempt.receiptId)}</td>
                  <td>{formatTimestamp(attempt.initiatedAt)}</td>
                  <td>{formatTimestamp(attempt.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No payment attempts recorded.</p>
      )}
      <h3>Resolution history</h3>
      <ResolutionHistory history={row.resolutions} />
    </section>
  );
}
