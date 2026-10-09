"use client";

import { recordHref } from "@/lib/routes";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, queryString } from "@/lib/api/client";
import { formatINR } from "@/lib/money";
import { Checkbox, Empty, ErrorState, Loading } from "@/components/ui";
import type { CustomerStatementResponse } from "./contracts";
import {
  ActiveFilters,
  DateRangeError,
  DateRangeFields,
  ExportCsv,
  MasterPicker,
  PrintReportAction,
  SummaryCards,
  humanize,
  selectReportParams,
  type PrintColumn,
  useReportParams,
  useSessionExpiry,
  validRange,
} from "./report-shared";

const allowed = ["from", "to", "companyId", "includeSettled"] as const;

type StatementEntry = CustomerStatementResponse["data"]["entries"][number];
const valueOrDash = (value: string | null | undefined) => value || "—";
const statementPrintColumns: Array<PrintColumn<StatementEntry>> = [
  { label: "Date", value: (entry) => valueOrDash(entry.date) },
  {
    label: "Type",
    value: (entry) =>
      entry.type === "SETTLEMENT_DISCOUNT"
        ? "Settlement discount"
        : humanize(entry.type),
  },
  {
    label: "Document Number",
    value: (entry) => valueOrDash(entry.documentNumber),
  },
  {
    label: "Description",
    value: (entry) => valueOrDash(entry.description),
    wrap: true,
  },
  { label: "Debit", value: (entry) => formatINR(entry.debit), numeric: true },
  {
    label: "Cash Credit",
    value: (entry) => formatINR(entry.cashCredit),
    numeric: true,
  },
  {
    label: "Discount Credit",
    value: (entry) => formatINR(entry.discountCredit),
    numeric: true,
  },
];

export function CustomerStatementPage({
  id,
  canPrint = true,
}: {
  id: string;
  canPrint?: boolean;
}) {
  const state = useReportParams();
  const params = selectReportParams(state.params, allowed);
  delete params.page;
  delete params.pageSize;
  const statement = useQuery({
    queryKey: ["reports", "customer-statement", id, params],
    queryFn: ({ signal }) =>
      api<CustomerStatementResponse>(
        `/reports/customers/${encodeURIComponent(id)}/statement${queryString(params)}`,
        { signal },
      ),
    enabled: validRange(params),
    placeholderData: keepPreviousData,
  });
  useSessionExpiry(statement.error);
  return (
    <>
      <Link className="back-link" href="/customers">
        ← Back to customers
      </Link>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Core reports · Customer ledger</p>
          <h1>{statement.data?.data.customer.name ?? "Customer Statement"}</h1>
          <p>
            {statement.data
              ? `${humanize(statement.data.data.customer.category)} customer`
              : "Chronological invoices, cash receipts and settlement discounts."}
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv
            path={`/reports/customers/${encodeURIComponent(id)}/statement/export`}
            params={params}
          />
          {statement.data && (
            <PrintReportAction
              title={`${statement.data.data.customer.name} — Customer Statement`}
              params={params}
              meta={{
                currency: "INR",
                dateBasis: "EVENT_TIMESTAMP",
                balanceBasis: "CURRENT",
                from: statement.data.data.dates.from ?? null,
                to: statement.data.data.dates.to ?? null,
              }}
              rows={statement.data.data.entries}
              page={1}
              pageSize={statement.data.data.entries.length}
              total={statement.data.data.entries.length}
              columns={statementPrintColumns}
              authorized={canPrint}
              reportBusy={statement.isFetching}
              scopeLabel="Full report"
              scopeDetail={`${statement.data.data.entries.length} entries`}
              sortDescription="Entry date (ascending)"
              summary={[
                {
                  label: "Debit",
                  value: formatINR(statement.data.data.summary.debit),
                },
                {
                  label: "Cash Credit",
                  value: formatINR(statement.data.data.summary.cashCredit),
                },
                {
                  label: "Discount Credit",
                  value: formatINR(statement.data.data.summary.discountCredit),
                },
                {
                  label: "Closing Balance",
                  value: formatINR(statement.data.data.summary.closingBalance),
                },
              ]}
            />
          )}
        </div>
      </header>
      <section className="report-filters statement-filters">
        <DateRangeFields params={params} setFilter={state.setFilter} />
        <MasterPicker
          resource="companies"
          label="Companies"
          value={params.companyId ?? ""}
          onChange={(value) => state.setFilter("companyId", value)}
        />
        <label className="field">
          <span>Settlement visibility</span>
          <span className="checkbox-row">
            <Checkbox
              checked={params.includeSettled === "false"}
              onChange={(e) =>
                state.setFilter(
                  "includeSettled",
                  e.target.checked ? "false" : "",
                )
              }
            />{" "}
            Hide settled invoices
          </span>
        </label>
      </section>
      <ActiveFilters params={params} onClear={state.clear} />
      <DateRangeError params={params} />
      {statement.isLoading ? (
        <Loading label="Loading customer statement" />
      ) : statement.isError ? (
        <ErrorState
          error={statement.error}
          onRetry={() => statement.refetch()}
        />
      ) : statement.data ? (
        <>
          <p className="report-meta">
            Period:{" "}
            <strong>
              {statement.data.data.dates.from ?? "Financial year start"}
            </strong>{" "}
            to{" "}
            <strong>
              {statement.data.data.dates.to ?? "Financial year end"}
            </strong>
            . Entries are chronological; the closing balance is current for this
            statement response.
          </p>
          <SummaryCards
            items={[
              {
                label: "Debit",
                value: formatINR(statement.data.data.summary.debit),
              },
              {
                label: "Cash credit",
                value: formatINR(statement.data.data.summary.cashCredit),
                tone: "success",
              },
              {
                label: "Discount credit",
                value: formatINR(statement.data.data.summary.discountCredit),
                hint: "Settlement discounts, not cash",
              },
              {
                label: "Closing balance",
                value: formatINR(statement.data.data.summary.closingBalance),
                tone: "danger",
              },
            ]}
          />
          {!statement.data.data.entries.length ? (
            <Empty
              title="No statement entries"
              detail="No customer statement activity matches this period and company filter."
            />
          ) : (
            <section className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Document</th>
                      <th>Description</th>
                      <th className="numeric">Debit</th>
                      <th className="numeric">Cash credit</th>
                      <th className="numeric">Discount credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.data.data.entries.map((entry, index) => (
                      <tr key={`${entry.type}-${entry.documentId}-${index}`}>
                        <td>{entry.date}</td>
                        <td>
                          {entry.type === "SETTLEMENT_DISCOUNT"
                            ? "Settlement discount"
                            : humanize(entry.type)}
                        </td>
                        <td>
                          {entry.type === "INVOICE" ? (
                            <Link
                              className="text-link"
                              href={recordHref(
                                "invoice-detail",
                                entry.documentId,
                              )}
                            >
                              {entry.documentNumber ?? "—"}
                            </Link>
                          ) : (
                            (entry.documentNumber ?? "—")
                          )}
                        </td>
                        <td>{entry.description}</td>
                        <td className="money numeric">
                          {formatINR(entry.debit)}
                        </td>
                        <td className="money numeric success-text">
                          {formatINR(entry.cashCredit)}
                        </td>
                        <td className="money numeric">
                          {formatINR(entry.discountCredit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
    </>
  );
}
