"use client";

import { recordHref } from "@/lib/routes";

import { Button as ClearFiltersButton } from "@/components/ui";
import Link from "next/link";
import {
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Select,
} from "@/components/ui";
import { formatINR } from "@/lib/money";
import type { TaxReportRow, TaxSummary } from "./contracts";
import {
  ActiveFilters,
  CommonFilters,
  DateRangeError,
  ExportCsv,
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

const defaults = { status: "ISSUED" };
const allowed = [
  "from",
  "to",
  "companyId",
  "customerId",
  "customerCategory",
  "serviceCategoryId",
  "q",
  "status",
  "component",
  "rate",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
] as const;
const sorts = [
  "component",
  "rate",
  "serviceCategory",
  "taxableBase",
  "taxAmount",
] as const;

const valueOrDash = (value: string | null | undefined) => value || "—";
const taxComponent = (value: TaxReportRow["component"]) =>
  value === "SERVICE_TAX" ? "Service Tax (legacy)" : value;
const taxPrintColumns: Array<PrintColumn<TaxReportRow>> = [
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
  { label: "Line Position", value: (row) => row.position, numeric: true },
  {
    label: "Description",
    value: (row) => valueOrDash(row.description),
    wrap: true,
  },
  { label: "Tax Treatment", value: (row) => humanize(row.taxTreatment) },
  { label: "Tax Component", value: (row) => taxComponent(row.component) },
  { label: "Tax Rate", value: (row) => `${row.rate}%`, numeric: true },
  {
    label: "Taxable Base",
    value: (row) => formatINR(row.taxableBase),
    numeric: true,
  },
  {
    label: "Tax Amount",
    value: (row) => formatINR(row.taxAmount),
    numeric: true,
  },
];

export function TaxReportPage({ canPrint = true }: { canPrint?: boolean }) {
  const state = useReportParams(defaults);
  const params = selectReportParams(state.params, allowed, sorts);
  const report = useReport<TaxReportRow, TaxSummary>(
    "/reports/taxes",
    params,
    validRange(params),
  );
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Core reports · Invoice date</p>
          <h1>Tax Report</h1>
          <p>
            Tax analysis for billing review. This report is not a GST return or
            statutory filing.
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv path="/reports/taxes/export" params={params} />
          {report.data && (
            <PrintReportAction
              title="Tax Report"
              params={params}
              meta={report.data.meta}
              rows={report.data.data}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={taxPrintColumns}
              authorized={canPrint}
              reportBusy={report.isFetching}
              summary={[
                { label: "Taxed Rows", value: report.data.summary.total },
                {
                  label: "Distinct-line Taxable Base",
                  value: formatINR(report.data.summary.taxableBase),
                },
                {
                  label: "Tax Amount",
                  value: formatINR(report.data.summary.taxAmount),
                },
              ]}
            />
          )}
        </div>
      </header>
      <CommonFilters params={params} setFilter={state.setFilter}>
        <Field label="Invoice status">
          <Select
            value={params.status}
            onChange={(e) => state.setFilter("status", e.target.value)}
          >
            <option value="ISSUED">Issued</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        <Field label="Tax component">
          <Select
            value={params.component ?? ""}
            onChange={(e) => state.setFilter("component", e.target.value)}
          >
            <option value="">All components</option>
            <option value="IGST">IGST</option>
            <option value="CGST">CGST</option>
            <option value="SGST">SGST</option>
            <option value="SERVICE_TAX">Service Tax (legacy)</option>
          </Select>
        </Field>
        <Field label="Rate">
          <Input
            value={params.rate ?? ""}
            onChange={(e) => state.setFilter("rate", e.target.value)}
            placeholder="18.00"
            inputMode="decimal"
          />
        </Field>
      </CommonFilters>
      <ActiveFilters
        params={params}
        defaults={defaults}
        onClear={state.clear}
      />
      <DateRangeError params={params} />
      {report.isLoading ? (
        <Loading label="Loading tax report" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          <SummaryCards
            items={[
              { label: "Taxed rows", value: report.data.summary.total },
              {
                label: "Distinct-line taxable base",
                value: formatINR(report.data.summary.taxableBase),
                hint: "Authoritative total; shared CGST/SGST bases are counted once",
              },
              {
                label: "Tax amount",
                value: formatINR(report.data.summary.taxAmount),
              },
            ]}
          />
          {!!report.data.summary.breakdown.length && (
            <section className="breakdown-card">
              <header className="card-header">
                <div>
                  <p className="eyebrow">Filtered breakdown</p>
                  <h2>Component, rate and service</h2>
                </div>
              </header>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Rate</th>
                      <th>Service category</th>
                      <th className="numeric">Invoices</th>
                      <th className="numeric">Taxed lines</th>
                      <th className="numeric">Tax amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.summary.breakdown.map((item, index) => (
                      <tr
                        key={`${item.component}-${item.rate}-${item.serviceCategoryName}-${index}`}
                      >
                        <td>
                          {item.component === "SERVICE_TAX"
                            ? "Service Tax (legacy)"
                            : item.component}
                        </td>
                        <td className="numeric">{item.rate}%</td>
                        <td>{item.serviceCategoryName}</td>
                        <td className="numeric">{item.invoiceCount}</td>
                        <td className="numeric">{item.taxedLineCount}</td>
                        <td className="money numeric">
                          {formatINR(item.taxAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {!report.data.data.length ? (
            <Empty
              action={
                <ClearFiltersButton variant="secondary" onClick={state.clear}>
                  Clear filters
                </ClearFiltersButton>
              }
              title="No tax results"
              detail="No tax lines match the active filters."
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
                      <th>Invoice / line</th>
                      <th>Customer</th>
                      <th>Service</th>
                      <th>
                        <SortHeader
                          label="Component"
                          value="component"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Taxable base"
                          value="taxableBase"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Tax amount"
                          value="taxAmount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.data.map((row) => (
                      <tr key={row.taxId}>
                        <td>
                          <Link
                            className="text-link"
                            href={recordHref("invoice-detail", row.invoiceId)}
                          >
                            {row.invoiceNumber ?? "Draft"}
                          </Link>
                          <small className="table-sub">
                            {row.invoiceDate} · line {row.position}:{" "}
                            {row.description}
                          </small>
                        </td>
                        <td>
                          {row.customerName}
                          <small className="table-sub">{row.companyName}</small>
                        </td>
                        <td>
                          {row.serviceCategoryName}
                          <small className="table-sub">
                            {humanize(row.taxTreatment)}
                          </small>
                        </td>
                        <td>
                          {taxComponent(row.component)}
                          <small className="table-sub">{row.rate}%</small>
                        </td>
                        <td className="money numeric">
                          {formatINR(row.taxableBase)}
                        </td>
                        <td className="money numeric">
                          {formatINR(row.taxAmount)}
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
