"use client";

import { Button as ClearFiltersButton } from "@/components/ui";
import Link from "next/link";
import {
  Checkbox,
  Empty,
  ErrorState,
  Field,
  Loading,
  Select,
} from "@/components/ui";
import { formatINR } from "@/lib/money";
import type { VehicleInvoiceRow, VehicleInvoiceSummary } from "./contracts";
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
  selectReportParams,
  type PrintColumn,
  useReport,
  useReportParams,
  validRange,
} from "./report-shared";

const defaults = { status: "ISSUED", sortBy: "grandTotal", sortOrder: "desc" };
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
  "includeUnassigned",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
] as const;
const sorts = [
  "registrationNumber",
  "vehicleName",
  "vehicleType",
  "invoiceCount",
  "grandTotal",
  "receivedAmount",
  "dueAmount",
] as const;

const valueOrDash = (value: string | null | undefined) => value || "—";
const vehiclePrintColumns: Array<PrintColumn<VehicleInvoiceRow>> = [
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
  { label: "Invoice Count", value: (row) => row.invoiceCount, numeric: true },
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
  {
    label: "First Invoice Date",
    value: (row) => valueOrDash(row.firstInvoiceDate),
  },
  {
    label: "Latest Invoice Date",
    value: (row) => valueOrDash(row.latestInvoiceDate),
  },
];

export function VehicleInvoicesPage({
  canPrint = true,
}: {
  canPrint?: boolean;
}) {
  const state = useReportParams(defaults);
  const params = selectReportParams(state.params, allowed, sorts);
  const report = useReport<VehicleInvoiceRow, VehicleInvoiceSummary>(
    "/reports/vehicle-invoices",
    params,
    validRange(params),
  );
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Core reports · Invoice date</p>
          <h1>Vehicle-wise Invoices</h1>
          <p>
            Invoice performance grouped by the historical vehicle labels saved
            with each document.
          </p>
        </div>
        <div className="header-actions">
          <ExportCsv path="/reports/vehicle-invoices/export" params={params} />
          {report.data && (
            <PrintReportAction
              title="Vehicle-wise Invoices"
              params={params}
              meta={report.data.meta}
              rows={report.data.data}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={vehiclePrintColumns}
              authorized={canPrint}
              reportBusy={report.isFetching}
              summary={[
                { label: "Vehicle Groups", value: report.data.summary.total },
                { label: "Invoices", value: report.data.summary.invoiceCount },
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
        <label className="field">
          <span>Unassigned invoices</span>
          <span className="checkbox-row">
            <Checkbox
              checked={params.includeUnassigned === "true"}
              onChange={(e) =>
                state.setFilter(
                  "includeUnassigned",
                  e.target.checked ? "true" : "",
                )
              }
            />{" "}
            Include historical invoices without a vehicle
          </span>
        </label>
      </CommonFilters>
      <ActiveFilters
        params={params}
        defaults={defaults}
        onClear={state.clear}
      />
      <DateRangeError params={params} />
      {report.isLoading ? (
        <Loading label="Loading vehicle-wise invoices" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          <SummaryCards
            items={[
              { label: "Vehicle groups", value: report.data.summary.total },
              { label: "Invoices", value: report.data.summary.invoiceCount },
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
              title="No vehicle groups"
              detail="No vehicle-wise invoice results match the active filters."
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
                          label="Vehicle"
                          value="registrationNumber"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>
                        <SortHeader
                          label="Type"
                          value="vehicleType"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th className="numeric">
                        <SortHeader
                          label="Invoices"
                          value="invoiceCount"
                          params={params}
                          update={state.update}
                        />
                      </th>
                      <th>Period</th>
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
                    {report.data.data.map((row, index) => {
                      const unassigned = row.vehicleId === null;
                      const drill = `/reports/invoices?${new URLSearchParams(Object.entries({ from: params.from ?? "", to: params.to ?? "", vehicleId: row.vehicleId ?? "", hasVehicle: unassigned ? "false" : "" }).filter(([, value]) => value))}`;
                      return (
                        <tr key={row.vehicleId ?? `unassigned-${index}`}>
                          <td>
                            <Link className="text-link" href={drill}>
                              <strong>
                                {unassigned
                                  ? "Unassigned historical invoices"
                                  : (row.vehicleRegistrationNumber ?? "—")}
                              </strong>
                            </Link>
                            <small className="table-sub">
                              {unassigned
                                ? "No vehicle snapshot"
                                : (row.vehicleName ?? "—")}
                            </small>
                          </td>
                          <td>{row.vehicleType ?? "—"}</td>
                          <td className="numeric">{row.invoiceCount}</td>
                          <td>
                            {row.firstInvoiceDate}
                            <small className="table-sub">
                              to {row.latestInvoiceDate}
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
                      );
                    })}
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
