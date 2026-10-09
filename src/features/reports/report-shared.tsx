"use client";

import { loginHref } from "@/lib/routes";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { Download, FilterX, Printer, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  apiBlob,
  getCollection,
  getResource,
  queryString,
  safeId,
} from "@/lib/api/client";
import type { Collection, CoreMaster } from "@/lib/api/contracts";
import { Button, ErrorState, Field, Input, Select } from "@/components/ui";
import type { ReportEnvelope, ReportMeta } from "./contracts";

export type ReportParams = Record<string, string>;
const emptyDefaults: ReportParams = {};

export function useReportParams(defaults: ReportParams = emptyDefaults) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const params = useMemo(() => {
    const next = { ...defaults };
    search.forEach((value, key) => {
      if (value) next[key] = value;
    });
    return next;
  }, [search, defaults]);

  const update = useCallback(
    (values: Record<string, string | number | boolean | null>) => {
      const next = new URLSearchParams(search.toString());
      Object.entries(values).forEach(([key, value]) => {
        if (value === null || value === "" || value === false) next.delete(key);
        else next.set(key, String(value));
      });
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, search],
  );

  const setFilter = useCallback(
    (key: string, value: string | boolean) => {
      update({ [key]: value, page: null });
    },
    [update],
  );

  const clear = useCallback(() => {
    const id = search.get("id");
    router.replace(`${pathname}${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
      scroll: false,
    });
  }, [pathname, router, search]);

  return { params, update, setFilter, clear };
}

export function useReport<Row, Summary>(
  path: string,
  params: ReportParams,
  valid = true,
) {
  const query = queryString(params);
  const result = useQuery({
    queryKey: ["report", path, query],
    queryFn: ({ signal }) =>
      fetchReport<Row, Summary>(`${path}${query}`, signal),
    enabled: valid,
    placeholderData: keepPreviousData,
    retry: (count, error) =>
      !(error instanceof ApiError && [401, 403, 422].includes(error.status)) &&
      count < 1,
  });
  useSessionExpiry(result.error);
  return result;
}

export function useSessionExpiry(error: unknown) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401)
      router.replace(loginHref(pathname));
  }, [error, pathname, router]);
}

async function fetchReport<Row, Summary>(path: string, signal: AbortSignal) {
  const { api } = await import("@/lib/api/client");
  return api<ReportEnvelope<Row, Summary>>(path, { signal });
}

export function DateRangeFields({
  params,
  setFilter,
}: {
  params: ReportParams;
  setFilter: (key: string, value: string) => void;
}) {
  return (
    <>
      <Field label="From">
        <Input
          type="date"
          value={params.from ?? ""}
          max={params.to || undefined}
          onChange={(event) => setFilter("from", event.target.value)}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          value={params.to ?? ""}
          min={params.from || undefined}
          onChange={(event) => setFilter("to", event.target.value)}
        />
      </Field>
    </>
  );
}

export function DateRangeError({ params }: { params: ReportParams }) {
  if (!params.from || !params.to || params.to >= params.from) return null;
  return (
    <div className="error-panel" role="alert">
      <strong>The end date must be on or after the start date.</strong>
    </div>
  );
}

export function SearchFilter({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    if (draft.trim() !== value) setDraft(value);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== value) onChange(draft.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange]);
  return (
    <Field label="Search">
      <span className="search-control report-search">
        <Search size={16} />
        <Input
          maxLength={maxLength}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search this report…"
        />
      </span>
    </Field>
  );
}

type PickerItem = CoreMaster & {
  name?: string;
  displayName?: string;
  registrationNumber?: string;
  username?: string;
};

export function MasterPicker({
  resource,
  label,
  value,
  onChange,
}: {
  resource:
    | "companies"
    | "customers"
    | "service-categories"
    | "vehicles"
    | "users";
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const options = useQuery({
    queryKey: [resource, "report-picker", page, q],
    queryFn: ({ signal }) =>
      getCollection<PickerItem>(
        `/${resource}${queryString({ page, pageSize: 25, q: q.trim().slice(0, 200) })}`,
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const selectedOption = options.data?.data.find((item) => item.id === value);
  const selectedRecord = useQuery({
    queryKey: [resource, "report-picker-selected", value],
    queryFn: ({ signal }) =>
      getResource<PickerItem>(`/${resource}/${safeId(value)}`, signal),
    enabled: Boolean(value && !selectedOption),
    staleTime: 60_000,
  });
  const selected = selectedOption ?? selectedRecord.data?.data;
  const display = (item: PickerItem) =>
    item.name ||
    item.displayName ||
    item.registrationNumber ||
    item.username ||
    item.id.slice(0, 10);
  return (
    <>
      <Field label={label}>
        <div className="picker-stack">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
          />
          <Select
            aria-label={`${label} filter`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">All {label.toLowerCase()}</option>
            {selected &&
              !options.data?.data.some((item) => item.id === value) && (
                <option value={selected.id}>{display(selected)}</option>
              )}
            {options.data?.data.map((item) => (
              <option key={item.id} value={item.id}>
                {display(item)}
              </option>
            ))}
          </Select>
          {options.data && options.data.pagination.total > 25 && (
            <span className="picker-pages">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <small>Options page {page}</small>
              <button
                type="button"
                disabled={page * 25 >= options.data.pagination.total}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </span>
          )}
        </div>
      </Field>
      {options.isError && (
        <ErrorState
          error={options.error}
          onRetry={() => void options.refetch()}
        />
      )}
      {selectedRecord.isError && (
        <ErrorState
          error={selectedRecord.error}
          onRetry={() => void selectedRecord.refetch()}
        />
      )}
    </>
  );
}

export function CommonFilters({
  params,
  setFilter,
  children,
  search = true,
  pickers = true,
}: {
  params: ReportParams;
  setFilter: (key: string, value: string | boolean) => void;
  children?: ReactNode;
  search?: boolean;
  pickers?: boolean;
}) {
  const filterState = useReportParams();
  const advancedActive = Object.keys(params).some(
    (key) =>
      !["from", "to", "q", "page", "pageSize", "sortBy", "sortOrder"].includes(
        key,
      ) && Boolean(params[key]),
  );
  return (
    <section className="report-filter-panel" aria-label="Report filters">
      <PeriodPresets params={params} update={filterState.update} />
      <div className="report-filters primary-filters">
        <DateRangeFields params={params} setFilter={setFilter} />
        {search && (
          <SearchFilter
            value={params.q ?? ""}
            onChange={(value) => setFilter("q", value)}
          />
        )}
      </div>
      <details className="advanced-filters" open={advancedActive || undefined}>
        <summary>More filters</summary>
        <div className="report-filters">
          {pickers && (
            <>
              <MasterPicker
                resource="companies"
                label="Companies"
                value={params.companyId ?? ""}
                onChange={(value) => setFilter("companyId", value)}
              />
              <MasterPicker
                resource="customers"
                label="Customers"
                value={params.customerId ?? ""}
                onChange={(value) => setFilter("customerId", value)}
              />
              <MasterPicker
                resource="service-categories"
                label="Service categories"
                value={params.serviceCategoryId ?? ""}
                onChange={(value) => setFilter("serviceCategoryId", value)}
              />
            </>
          )}
          <Field label="Customer category">
            <Select
              value={params.customerCategory ?? ""}
              onChange={(event) =>
                setFilter("customerCategory", event.target.value)
              }
            >
              <option value="">All categories</option>
              <option value="AGENT">Agent</option>
              <option value="LEISURE">Leisure</option>
              <option value="CORPORATE">Corporate</option>
            </Select>
          </Field>
          {children}
        </div>
      </details>
    </section>
  );
}

export function ActiveFilters({
  params,
  defaults,
  onClear,
}: {
  params: ReportParams;
  defaults?: ReportParams;
  onClear: () => void;
}) {
  const state = useReportParams();
  const active = Object.entries(params).filter(
    ([key, value]) =>
      value &&
      !["page", "pageSize"].includes(key) &&
      (!defaults || defaults[key] !== value),
  );
  const lookups = useQueries({
    queries: printMasterFilters.map(({ key, resource }) => ({
      queryKey: [resource, "report-print-selected", key, params[key]],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getResource<PickerItem>(`/${resource}/${safeId(params[key])}`, signal),
      enabled: Boolean(params[key]),
      staleTime: 60_000,
      retry: false,
    })),
  });
  if (!active.length) return null;
  return (
    <div className="active-filters" aria-label="Active filters">
      <div className="filter-chips">
        {active.map(([key, value]) => {
          const index = printMasterFilters.findIndex(
            (item) => item.key === key,
          );
          const label =
            index >= 0
              ? printMasterFilters[index].label
              : (printFilterLabels[key] ?? humanize(key));
          const display =
            index >= 0
              ? (masterDisplay(lookups[index].data?.data) ??
                `Selected ${label.toLowerCase()}`)
              : printFilterValue(key, value);
          return (
            <Button
              key={key}
              variant="secondary"
              aria-label={`Remove ${label} filter`}
              onClick={() => state.setFilter(key, "")}
            >
              <span>
                {label}: {display}
              </span>
              <span aria-hidden="true">×</span>
            </Button>
          );
        })}
      </div>
      <Button variant="ghost" onClick={onClear}>
        <FilterX size={15} /> Clear all
      </Button>
    </div>
  );
}

export function ReportMetaLine({ meta }: { meta: ReportMeta }) {
  return (
    <p className="report-meta">
      Date basis: <strong>{humanize(meta.dateBasis)}</strong> · Period:{" "}
      {meta.from ??
        (meta.dateBasis === "PAYMENT_ACTIVITY_IST"
          ? "All history"
          : "Financial year start")}{" "}
      to{" "}
      {meta.to ??
        (meta.dateBasis === "PAYMENT_ACTIVITY_IST"
          ? "Present"
          : "Financial year end")}{" "}
      · Current balances · Generated {formatTimestamp(meta.generatedAt)}
    </p>
  );
}

export function SummaryCards({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    hint?: string;
    tone?: string;
  }>;
}) {
  return (
    <section className="report-summary" aria-label="Report summary">
      {items.map((item) => (
        <div key={item.label} className={item.tone ? `tone-${item.tone}` : ""}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint && <small>{item.hint}</small>}
        </div>
      ))}
    </section>
  );
}

export function ExportCsv({
  path,
  params,
}: {
  path: string;
  params: ReportParams;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function download() {
    setWorking(true);
    setError(null);
    try {
      const exportParams = { ...params };
      delete exportParams.page;
      delete exportParams.pageSize;
      const result = await apiBlob(`${path}${queryString(exportParams)}`);
      const filename =
        result.disposition?.match(
          /filename\*?=(?:UTF-8''|\")?([^\";]+)/i,
        )?.[1] ?? "core-report.csv";
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = decodeURIComponent(
        filename.trim().replace(/^\"|\"$/g, ""),
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace(loginHref(pathname));
        return;
      }
      setError(caught);
    } finally {
      setWorking(false);
    }
  }
  const oversized = error instanceof ApiError && error.status === 413;
  return (
    <div className="export-action" aria-live="polite">
      <Button variant="secondary" onClick={download} disabled={working}>
        <Download size={17} /> {working ? "Preparing CSV…" : "Export CSV"}
      </Button>
      {oversized ? (
        <small className="field-error">
          Narrow the report filters before exporting more than 100,000 rows.
        </small>
      ) : error ? (
        <ErrorState error={error} />
      ) : null}
    </div>
  );
}

export interface PrintColumn<Row> {
  label: string;
  value: (row: Row) => ReactNode;
  numeric?: boolean;
  wrap?: boolean;
}

interface PrintSummaryItem {
  label: string;
  value: ReactNode;
}

const printMasterFilters = [
  { key: "companyId", label: "Company", resource: "companies" },
  { key: "customerId", label: "Customer", resource: "customers" },
  {
    key: "serviceCategoryId",
    label: "Service category",
    resource: "service-categories",
  },
  { key: "vehicleId", label: "Vehicle", resource: "vehicles" },
  { key: "creatorId", label: "Creator", resource: "users" },
  { key: "actorId", label: "Actor", resource: "users" },
] as const;

const printFilterLabels: Record<string, string> = {
  q: "Search",
  status: "Invoice status",
  paymentStatus: "Payment status",
  customerCategory: "Customer category",
  financialYear: "Financial year",
  hasVehicle: "Vehicle assignment",
  includeUnassigned: "Unassigned invoices",
  component: "Tax component",
  rate: "Tax rate",
  method: "Payment method",
  source: "Payment source",
  receiptStatus: "Receipt status",
  gatewayStatus: "Gateway status",
  needsReview: "Requires review",
  ageingBucket: "Ageing bucket",
  overdueOnly: "Due state",
  dueFrom: "Due from",
  dueTo: "Due to",
  includeSettled: "Settled invoices",
  action: "Action",
  entityType: "Entity type",
  entityId: "Entity",
};

function printFilterValue(key: string, value: string) {
  if (key === "needsReview") return "Yes";
  if (key === "q") return `“${value}”`;
  if (key === "overdueOnly") return value === "true" ? "Overdue only" : "All";
  if (key === "includeSettled")
    return value === "false" ? "Hidden" : "Included";
  if (key === "entityId") return "Selected record";
  if (key === "hasVehicle") return value === "true" ? "Assigned" : "Unassigned";
  if (key === "includeUnassigned")
    return value === "true" ? "Included" : "Excluded";
  return humanize(value);
}

function masterDisplay(item: PickerItem | undefined) {
  if (!item) return null;
  return (
    item.name ||
    item.displayName ||
    item.registrationNumber ||
    item.username ||
    null
  );
}

export function PrintReportAction<Row>({
  title,
  params,
  meta,
  rows,
  page,
  pageSize,
  total,
  columns,
  summary,
  authorized = true,
  reportBusy = false,
  scopeLabel = "Current page",
  scopeDetail,
  sortDescription,
}: {
  title: string;
  params: ReportParams;
  meta: Omit<ReportMeta, "generatedAt"> & { generatedAt?: string };
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  columns: Array<PrintColumn<Row>>;
  summary: PrintSummaryItem[];
  authorized?: boolean;
  reportBusy?: boolean;
  scopeLabel?: string;
  scopeDetail?: string;
  sortDescription?: string;
}) {
  const [working, setWorking] = useState(false);
  const [preparedAt, setPreparedAt] = useState<string | null>(null);
  const masterQueries = useQueries({
    queries: printMasterFilters.map(({ key, resource }) => ({
      queryKey: [resource, "report-print-selected", key, params[key]],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getResource<PickerItem>(`/${resource}/${safeId(params[key])}`, signal),
      enabled: Boolean(authorized && params[key]),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const resolvingFilters = printMasterFilters.some(
    ({ key }, index) => Boolean(params[key]) && masterQueries[index].isPending,
  );
  const filters = useMemo(() => {
    const selected: Array<{ label: string; value: string }> = [];
    printMasterFilters.forEach(({ key, label }, index) => {
      if (!params[key]) return;
      selected.push({
        label,
        value:
          masterDisplay(masterQueries[index].data?.data) ??
          `Selected ${label.toLowerCase()}`,
      });
    });
    Object.entries(printFilterLabels).forEach(([key, label]) => {
      if (params[key])
        selected.push({ label, value: printFilterValue(key, params[key]) });
    });
    return selected;
  }, [masterQueries, params]);

  useEffect(() => {
    if (!working || resolvingFilters) return;
    const finish = () => {
      document.body.classList.remove("report-printing");
      setWorking(false);
      setPreparedAt(null);
    };
    document.body.classList.add("report-printing");
    window.addEventListener("afterprint", finish, { once: true });
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => window.print());
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove("report-printing");
    };
  }, [resolvingFilters, working]);

  if (!authorized) return null;
  const firstRow = total ? (page - 1) * pageSize + 1 : 0;
  const lastRow = total ? Math.min(page * pageSize, total) : 0;
  return (
    <>
      <Button
        variant="secondary"
        type="button"
        aria-label={`Print ${title}`}
        aria-busy={working || reportBusy}
        disabled={working || reportBusy}
        onClick={() => {
          setPreparedAt(new Date().toISOString());
          setWorking(true);
        }}
      >
        <Printer size={17} />
        {working
          ? "Preparing print view…"
          : reportBusy
            ? "Updating report…"
            : "Print"}
      </Button>
      {working &&
        createPortal(
          <article className="print-report" aria-label={`${title} print view`}>
            <header className="print-report-header">
              <div>
                <p>Eastern Risen Admin</p>
                <h1>{title}</h1>
              </div>
              <dl>
                <div>
                  <dt>Selected date range</dt>
                  <dd>
                    {meta.from ??
                      (meta.dateBasis === "PAYMENT_ACTIVITY_IST"
                        ? "All history"
                        : "Financial year start")}{" "}
                    to{" "}
                    {meta.to ??
                      (meta.dateBasis === "PAYMENT_ACTIVITY_IST"
                        ? "Present"
                        : "Financial year end")}
                  </dd>
                </div>
                <div>
                  <dt>
                    {meta.generatedAt
                      ? "Report generated"
                      : "Prepared for print"}
                  </dt>
                  <dd>{formatTimestamp(meta.generatedAt ?? preparedAt)}</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>{meta.currency}</dd>
                </div>
                <div>
                  <dt>Printed scope</dt>
                  <dd>
                    <strong>{scopeLabel}</strong> ·{" "}
                    {scopeDetail ?? `rows ${firstRow}–${lastRow} of ${total}`}
                  </dd>
                </div>
              </dl>
            </header>
            <section
              className="print-report-filters"
              aria-label="Active filter summary"
            >
              <strong>Active filters:</strong>{" "}
              {filters.length
                ? filters
                    .map((filter) => `${filter.label}: ${filter.value}`)
                    .join(" · ")
                : "None"}
              {(params.sortBy || sortDescription) && (
                <>
                  {" "}
                  · <strong>Server sort:</strong>{" "}
                  {sortDescription ??
                    `${humanize(params.sortBy)} (${params.sortOrder === "desc" ? "descending" : "ascending"})`}
                </>
              )}
            </section>
            <section
              className="print-report-summary"
              aria-label="Full filtered report totals"
            >
              <h2>Full filtered report totals</h2>
              <dl>
                {summary.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.label}
                      className={column.numeric ? "numeric" : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {columns.map((column) => (
                        <td
                          key={column.label}
                          className={
                            `${column.numeric ? "numeric" : ""} ${column.wrap ? "print-wrap" : ""}`.trim() ||
                            undefined
                          }
                        >
                          {column.value(row) ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="print-empty-row" colSpan={columns.length}>
                      No rows match the active filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </article>,
          document.body,
        )}
    </>
  );
}

export function ReportPagination({
  pagination,
  update,
}: {
  pagination: Collection<unknown>["pagination"];
  update: (values: Record<string, string | number | boolean | null>) => void;
}) {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return (
    <div className="pagination">
      <span>
        Showing{" "}
        {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}
        –{Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
        {pagination.total}
      </span>
      <label>
        Rows
        <Select
          value={pagination.pageSize}
          onChange={(event) =>
            update({ pageSize: event.target.value, page: null })
          }
        >
          {Array.from(new Set([pagination.pageSize, 25, 50, 100]))
            .sort((a, b) => a - b)
            .map((size) => (
              <option key={size}>{size}</option>
            ))}
        </Select>
      </label>
      <div>
        <Button
          variant="ghost"
          disabled={pagination.page <= 1}
          onClick={() => update({ page: pagination.page - 1 })}
        >
          Previous
        </Button>
        <span>
          Page {pagination.page} of {pages}
        </span>
        <Button
          variant="ghost"
          disabled={pagination.page >= pages}
          onClick={() => update({ page: pagination.page + 1 })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function SortHeader({
  label,
  value,
  params,
  update,
}: {
  label: string;
  value: string;
  params: ReportParams;
  update: (values: Record<string, string | number | boolean | null>) => void;
}) {
  const active = params.sortBy === value;
  return (
    <button
      type="button"
      className="sort-button"
      onClick={() =>
        update({
          sortBy: value,
          sortOrder: active && params.sortOrder === "asc" ? "desc" : "asc",
          page: null,
        })
      }
    >
      {label} {active ? (params.sortOrder === "asc" ? "↑" : "↓") : "↕"}
    </button>
  );
}

export const validRange = (params: ReportParams) =>
  !params.from || !params.to || params.to >= params.from;

export function selectReportParams(
  params: ReportParams,
  allowed: readonly string[],
  sortValues: readonly string[] = [],
) {
  const selected: ReportParams = {};
  allowed.forEach((key) => {
    const value = params[key];
    if (value) selected[key] = value;
  });
  if (selected.sortBy && !sortValues.includes(selected.sortBy))
    delete selected.sortBy;
  if (selected.sortOrder && !["asc", "desc"].includes(selected.sortOrder))
    delete selected.sortOrder;
  const page = Number(selected.page ?? 1);
  const pageSize = Number(selected.pageSize ?? 25);
  selected.page = String(Number.isInteger(page) && page > 0 ? page : 1);
  selected.pageSize = String([25, 50, 100].includes(pageSize) ? pageSize : 25);
  return selected;
}

export const humanize = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());

export const formatTimestamp = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "—";

export const shortId = (value: string) => `${value.slice(0, 8)}…`;

export function PeriodPresets({
  params,
  update,
  setRange,
}: {
  params: ReportParams;
  update: (values: Record<string, string | number | boolean | null>) => void;
  setRange?: (from: string, to: string) => void;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  function range(days: number) {
    const from = new Date(`${today}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - days + 1);
    const start = from.toISOString().slice(0, 10);
    if (setRange) setRange(start, today);
    else update({ from: start, to: today, page: null });
  }
  return (
    <div className="period-presets" role="group" aria-label="Date presets">
      <Button
        variant="ghost"
        onClick={() => {
          if (setRange) setRange("", "");
          else update({ from: null, to: null, page: null });
        }}
      >
        Default period
      </Button>
      <Button
        variant={
          params.from === today && params.to === today ? "primary" : "ghost"
        }
        onClick={() => range(1)}
      >
        Today
      </Button>
      <Button variant="ghost" onClick={() => range(30)}>
        Last 30 days
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          const start = `${today.slice(0, 7)}-01`;
          if (setRange) setRange(start, today);
          else update({ from: start, to: today, page: null });
        }}
      >
        This month
      </Button>
    </div>
  );
}
