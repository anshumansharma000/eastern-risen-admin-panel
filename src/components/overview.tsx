"use client";

import { recordHref } from "@/lib/routes";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, FilePlus2 } from "lucide-react";
import { api, queryString } from "@/lib/api/client";
import type { CoreRole } from "@/lib/api/contracts";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { Button, Empty, ErrorState, Field, Loading, Select } from "./ui";
import type {
  AgeingBucket,
  DashboardResponse,
} from "@/features/reports/contracts";
import {
  ActiveFilters,
  DateRangeError,
  DateRangeFields,
  MasterPicker,
  SummaryCards,
  formatTimestamp,
  selectReportParams,
  useReportParams,
  useSessionExpiry,
  validRange,
} from "@/features/reports/report-shared";

const allowed = [
  "from",
  "to",
  "companyId",
  "customerCategory",
  "serviceCategoryId",
] as const;
const ageingLabels: Record<AgeingBucket, string> = {
  NOT_DUE: "Not due",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_PLUS": "90+ days",
  NO_DUE_DATE: "No due date",
};

export function Overview({ role }: { role: CoreRole }) {
  const state = useReportParams();
  const params = selectReportParams(state.params, allowed);
  delete params.page;
  delete params.pageSize;
  const dashboard = useQuery({
    queryKey: ["reports", "dashboard", params],
    queryFn: ({ signal }) =>
      api<DashboardResponse>(`/reports/dashboard${queryString(params)}`, {
        signal,
      }),
    enabled: validRange(params),
  });
  useSessionExpiry(dashboard.error);
  const period = dashboard.data?.data.period;
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Operations workspace · Live analytics</p>
          <h1>Overview</h1>
          <p>
            Invoice, cash collection and current receivables signals from the
            reporting ledger.
          </p>
        </div>
        {can(role, "billing") && (
          <Link className="button button-primary" href="/invoices/new">
            <FilePlus2 size={17} /> New draft
          </Link>
        )}
      </header>
      <div className="period-presets" role="group" aria-label="Period preset">
        <Button
          variant={!params.from && !params.to ? "primary" : "ghost"}
          onClick={() => state.update({ from: null, to: null })}
        >
          Current financial year
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const to = new Date();
            const from = new Date();
            from.setDate(to.getDate() - 29);
            state.update({ from: isoDate(from), to: isoDate(to) });
          }}
        >
          Last 30 days
        </Button>
        <span>Custom range</span>
      </div>
      <section className="report-filters dashboard-filters">
        <DateRangeFields params={params} setFilter={state.setFilter} />
        <MasterPicker
          resource="companies"
          label="Companies"
          value={params.companyId ?? ""}
          onChange={(value) => state.setFilter("companyId", value)}
        />
        <Field label="Customer category">
          <Select
            value={params.customerCategory ?? ""}
            onChange={(e) =>
              state.setFilter("customerCategory", e.target.value)
            }
          >
            <option value="">All categories</option>
            <option value="AGENT">Agent</option>
            <option value="LEISURE">Leisure</option>
            <option value="CORPORATE">Corporate</option>
          </Select>
        </Field>
        <MasterPicker
          resource="service-categories"
          label="Service categories"
          value={params.serviceCategoryId ?? ""}
          onChange={(value) => state.setFilter("serviceCategoryId", value)}
        />
      </section>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {dashboard.isLoading ? (
        <Loading label="Loading Core analytics" />
      ) : dashboard.isError ? (
        <ErrorState
          error={dashboard.error}
          onRetry={() => dashboard.refetch()}
        />
      ) : dashboard.data ? (
        <>
          <p className="report-meta">
            Period:{" "}
            <strong>{period?.from ?? "Current financial year start"}</strong> to{" "}
            <strong>{period?.to ?? "Current financial year end"}</strong> ·
            Current balances · Generated{" "}
            {formatTimestamp(dashboard.data.data.generatedAt)}
          </p>
          <DashboardCard title="Needs attention" eyebrow="Needs attention">
            <p className="filter-scope">
              Payment reviews are a global operational count, independent of the
              dashboard filters.
            </p>
            <div className="alert-grid">
              {dashboard.data.data.alerts.paymentsRequiringReview !==
                undefined && (
                <AlertLink
                  count={dashboard.data.data.alerts.paymentsRequiringReview}
                  label="Payments requiring review"
                  href="/reports/payments-received?needsReview=true"
                />
              )}
              <AlertLink
                count={dashboard.data.data.alerts.staleDrafts}
                label="Drafts needing review"
                href="/invoices?status=DRAFT"
              />
              <AlertLink
                count={dashboard.data.data.alerts.receivablesWithoutDueDate}
                label="Receivables without due date"
                href="/reports/receivables?ageingBucket=NO_DUE_DATE"
              />
              <AlertLink
                count={dashboard.data.data.alerts.incompleteCompanies}
                label="Incomplete companies"
                href="/configuration/companies"
              />
              <AlertLink
                count={dashboard.data.data.alerts.hotelRatesExpiringSoon}
                label="Hotel rates expiring soon"
                href="/hotel-rates"
              />
              <div>
                <AlertTriangle size={18} />
                <strong>{dashboard.data.data.alerts.staleOutboxEvents}</strong>
                <span>Stale outbox events</span>
                <small>Operational follow-up required</small>
              </div>
            </div>
          </DashboardCard>
          <SummaryCards
            items={[
              {
                label: "Issued invoices",
                value: dashboard.data.data.cards.issuedInvoiceCount,
              },
              {
                label: "Invoiced amount",
                value: formatINR(dashboard.data.data.cards.invoicedAmount),
              },
              {
                label: "Cash received",
                value: formatINR(
                  dashboard.data.data.cards.cashReceivedDuringPeriod,
                ),
                hint: "Receipt date",
                tone: "success",
              },
              {
                label: "Outstanding now",
                value: formatINR(dashboard.data.data.cards.outstandingNow),
                hint: "Current balance",
                tone: "danger",
              },
            ]}
          />
          <details className="analytics-details">
            <summary>More financial metrics</summary>
            <SummaryCards
              items={[
                {
                  label: "Tax billed",
                  value: formatINR(dashboard.data.data.cards.taxBilled),
                },
                {
                  label: "Settlement discounts",
                  value: formatINR(
                    dashboard.data.data.cards.settlementDiscountsDuringPeriod,
                  ),
                  hint: "Commercial discounts, not cash",
                },
                {
                  label: "Overdue",
                  value: formatINR(dashboard.data.data.cards.overdueAmount),
                  hint: `${dashboard.data.data.cards.overdueInvoiceCount} invoices`,
                  tone: "danger",
                },
                {
                  label: "Cash collection rate",
                  value: rate(dashboard.data.data.cards.cashCollectionRate),
                  hint: "Confirmed cash against the filtered invoice cohort ÷ cohort grand total",
                },
                {
                  label: "Settlement coverage",
                  value: rate(dashboard.data.data.cards.settlementCoverageRate),
                  hint: "Confirmed cash + active commercial discounts ÷ grand total",
                },
              ]}
            />
          </details>
          <details className="analytics-details">
            <summary>Financial trends and breakdowns</summary>
            <div className="dashboard-grid wide">
              <DashboardCard
                title="Financial trend"
                eyebrow="Invoice date vs receipt date"
              >
                <p className="chart-note">
                  Invoiced amount uses invoice date; cash received uses receipt
                  date.
                </p>
                {dashboard.data.data.financialTrend.length ? (
                  <div className="trend-chart">
                    {dashboard.data.data.financialTrend.map((item) => (
                      <div key={item.month} className="trend-row">
                        <span>{item.month}</span>
                        <div>
                          <i
                            className="bar invoiced"
                            style={{
                              width: barWidth(
                                item.invoicedAmount,
                                dashboard.data.data.financialTrend.flatMap(
                                  (point) => [
                                    point.invoicedAmount,
                                    point.receivedAmount,
                                  ],
                                ),
                              ),
                            }}
                            title={`Invoiced ${formatINR(item.invoicedAmount)}`}
                          />
                          <i
                            className="bar received"
                            style={{
                              width: barWidth(
                                item.receivedAmount,
                                dashboard.data.data.financialTrend.flatMap(
                                  (point) => [
                                    point.invoicedAmount,
                                    point.receivedAmount,
                                  ],
                                ),
                              ),
                            }}
                            title={`Received ${formatINR(item.receivedAmount)}`}
                          />
                        </div>
                        <small>
                          {formatINR(item.invoicedAmount)} /{" "}
                          {formatINR(item.receivedAmount)}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="No trend data"
                    detail="No monthly activity is available for this period."
                  />
                )}
                <div className="chart-legend">
                  <span>
                    <i className="invoiced" /> Invoiced
                  </span>
                  <span>
                    <i className="received" /> Cash received
                  </span>
                </div>
              </DashboardCard>
              <DashboardCard
                title="Receivables ageing"
                eyebrow="Current balances"
              >
                <div className="metric-list">
                  {dashboard.data.data.receivablesAgeing.map((item) => (
                    <Link
                      key={item.ageingBucket}
                      href={`/reports/receivables?ageingBucket=${item.ageingBucket}`}
                    >
                      <span>
                        <strong>{ageingLabels[item.ageingBucket]}</strong>
                        <small>
                          {item.outstandingInvoiceCount} unpaid invoices
                        </small>
                      </span>
                      <strong>{formatINR(item.dueAmount)}</strong>
                    </Link>
                  ))}
                </div>
              </DashboardCard>
            </div>
            <div className="dashboard-grid thirds">
              <DashboardCard
                title="Customer category mix"
                eyebrow="Issued invoices"
              >
                <div className="metric-list">
                  {dashboard.data.data.customerCategoryMix.map((item) => (
                    <div key={item.label}>
                      <span>
                        <strong>
                          {item.label.charAt(0) +
                            item.label.slice(1).toLowerCase()}
                        </strong>
                        <small>{item.invoiceCount} invoices</small>
                      </span>
                      <strong>{formatINR(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              </DashboardCard>
              <DashboardCard
                title="Service category mix"
                eyebrow="Issued invoices"
              >
                <div className="metric-list">
                  {dashboard.data.data.serviceCategoryMix.map((item) => (
                    <div key={item.label}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.invoiceCount} invoices</small>
                      </span>
                      <strong>{formatINR(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              </DashboardCard>
              <DashboardCard title="Payment methods" eyebrow="Confirmed cash">
                <div className="metric-list">
                  {dashboard.data.data.paymentMethodMix.map((item) => (
                    <div key={item.method}>
                      <span>
                        <strong>{item.method}</strong>
                        <small>{item.count} receipts</small>
                      </span>
                      <strong>{formatINR(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </div>
          </details>
          <div className="dashboard-grid wide">
            <DashboardCard
              title="Top outstanding customers"
              eyebrow="Current balances"
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="numeric">Invoices</th>
                      <th>Oldest due</th>
                      <th className="numeric">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.data.data.topOutstandingCustomers.map((item) => (
                      <tr key={item.customerId}>
                        <td>
                          <Link
                            className="text-link"
                            href={recordHref(
                              "customer-statement",
                              item.customerId,
                            )}
                          >
                            {item.customerName}
                          </Link>
                          <small className="table-sub">
                            {item.customerCategory}
                          </small>
                        </td>
                        <td className="numeric">{item.invoiceCount}</td>
                        <td>{item.oldestDueDate ?? "—"}</td>
                        <td className="money numeric due-text">
                          {formatINR(item.dueAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardCard>
            <DashboardCard title="Recent activity" eyebrow="Core audit">
              <div className="activity-list">
                {dashboard.data.data.recentActivity.map((item) => (
                  <div key={item.id}>
                    <strong>{readable(item.action)}</strong>
                    <span>
                      {readable(item.entityType)} · {item.entityId.slice(0, 8)}…
                    </span>
                    <small>{formatTimestamp(item.createdAt)}</small>
                  </div>
                ))}
              </div>
              {role === "CORE_ADMIN" && (
                <Link className="card-link" href="/reports/audit">
                  Open audit activity
                </Link>
              )}
            </DashboardCard>
          </div>
        </>
      ) : null}
    </>
  );
}

function DashboardCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-card">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}
function AlertLink({
  count,
  label,
  href,
}: {
  count: number;
  label: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <AlertTriangle size={18} />
      <strong>{count}</strong>
      <span>{label}</span>
    </Link>
  );
}
function rate(value: number | null) {
  return value === null
    ? "Not available"
    : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)}%`;
}
function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}
function barWidth(value: string, values: string[]) {
  const max = Math.max(...values.map(Number), 1);
  return `${Math.max(2, (Number(value) / max) * 100)}%`;
}
