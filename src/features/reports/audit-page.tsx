"use client";

import { Button as ClearFiltersButton } from "@/components/ui";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { CoreUser } from "@/lib/api/contracts";
import { getAllRecords } from "@/lib/all-records";
import { resolveAuditActor } from "./audit-actors";
import {
  auditEntityType,
  canResolveAuditEntity,
  loadAuditEntity,
  staffAuditEntity,
  type AuditEntity,
} from "./audit-entities";
import { Empty, ErrorState, Field, Input, Loading } from "@/components/ui";
import type { AuditRow } from "./contracts";
import {
  ActiveFilters,
  DateRangeError,
  DateRangeFields,
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
  useReport,
  useReportParams,
  validRange,
  type PrintColumn,
} from "./report-shared";

const defaults = { sortOrder: "desc" };
const allowed = [
  "from",
  "to",
  "actorId",
  "action",
  "entityType",
  "entityId",
  "sortOrder",
  "page",
  "pageSize",
] as const;

type AuditDisplayRow = AuditRow & {
  actorName: string;
  actorDetails: string;
  entityLabel: string;
  entityContext: string;
  entityHref?: string;
  entityLinkLabel?: string;
  activity: string;
};
const auditPrintColumns: Array<PrintColumn<AuditDisplayRow>> = [
  { label: "Event Time", value: (row) => formatTimestamp(row.createdAt) },
  {
    label: "Actor",
    value: (row) =>
      [row.actorName, row.actorDetails].filter(Boolean).join(" · "),
    wrap: true,
  },
  { label: "Activity", value: (row) => row.activity, wrap: true },
  {
    label: "Affected record",
    value: (row) =>
      [row.entityLabel, row.entityContext].filter(Boolean).join(" · "),
    wrap: true,
  },
  { label: "Entity ID", value: (row) => row.entityId, wrap: true },
  {
    label: "Entity Type",
    value: (row) => humanize(row.entityType),
    wrap: true,
  },
];

export function AuditPage({ canPrint = true }: { canPrint?: boolean }) {
  const state = useReportParams(defaults);
  const params = selectReportParams(state.params, allowed);
  const report = useReport<AuditRow, { total: number }>(
    "/reports/audit",
    params,
    validRange(params),
  );
  const actors = useQuery({
    queryKey: ["users", "audit-actor-directory"],
    queryFn: ({ signal }) =>
      getAllRecords<CoreUser>("/users?page=1&pageSize=100", signal),
    enabled: Boolean(
      report.data?.data.some(
        (row) =>
          row.actorId ||
          ["USER", "CORE_USER"].includes(auditEntityType(row.entityType)),
      ),
    ),
    staleTime: 60_000,
    retry: false,
  });
  const targets = [
    ...new Map(
      (report.data?.data ?? [])
        .filter(canResolveAuditEntity)
        .map((row) => [
          `${auditEntityType(row.entityType)}:${row.entityId}`,
          row,
        ]),
    ).values(),
  ];
  const entities = useQueries({
    queries: targets.map((row) => ({
      queryKey: ["audit-entity", auditEntityType(row.entityType), row.entityId],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        loadAuditEntity(row, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const entityResults = new Map(
    targets.map((row, index) => [
      `${auditEntityType(row.entityType)}:${row.entityId}`,
      entities[index],
    ]),
  );
  const rows = (report.data?.data ?? []).map((row): AuditDisplayRow => {
    const actor = resolveAuditActor(row, actors.data?.data ?? []);
    const result = entityResults.get(
      `${auditEntityType(row.entityType)}:${row.entityId}`,
    );
    const entity: AuditEntity | undefined =
      staffAuditEntity(row, actors.data?.data ?? []) ?? result?.data;
    return {
      ...row,
      activity: humanize(row.action.replace(/[.:-]/g, "_")),
      entityLabel:
        entity?.label ||
        (result?.isLoading
          ? "Loading record…"
          : `${humanize(row.entityType)} · details unavailable`),
      entityContext: entity?.context || "",
      entityHref: entity?.href,
      entityLinkLabel: entity?.linkLabel,
      actorName: actor.resolved
        ? actor.name
        : actors.isLoading
          ? "Loading actor…"
          : actor.name,
      actorDetails:
        actor.details ||
        (actors.isLoading
          ? ""
          : actor.resolved
            ? "Role unavailable"
            : "Actor details unavailable"),
    };
  });
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Core administrator · Event timestamp</p>
          <h1>Core Audit Activity</h1>
          <p>See who acted, what happened, and which record was affected.</p>
        </div>
        <div className="header-actions">
          <ExportCsv path="/reports/audit/export" params={params} />
          {report.data && (
            <PrintReportAction
              title="Core Audit Activity"
              params={params}
              meta={report.data.meta}
              rows={rows}
              page={report.data.pagination.page}
              pageSize={report.data.pagination.pageSize}
              total={report.data.pagination.total}
              columns={auditPrintColumns}
              authorized={canPrint}
              reportBusy={
                report.isFetching ||
                actors.isFetching ||
                entities.some((item) => item.isFetching)
              }
              sortDescription={`Event time (${params.sortOrder === "asc" ? "ascending" : "descending"})`}
              summary={[
                { label: "Audit Events", value: report.data.summary.total },
              ]}
            />
          )}
        </div>
      </header>
      <section className="report-filters">
        <DateRangeFields params={params} setFilter={state.setFilter} />
        <MasterPicker
          resource="users"
          label="Actors"
          value={params.actorId ?? ""}
          onChange={(value) => state.setFilter("actorId", value)}
        />
        <Field label="Action">
          <Input
            value={params.action ?? ""}
            onChange={(e) => state.setFilter("action", e.target.value)}
            list="audit-actions"
            placeholder="Choose or type an action"
          />
        </Field>
        <Field label="Entity type">
          <Input
            value={params.entityType ?? ""}
            onChange={(e) => state.setFilter("entityType", e.target.value)}
            list="audit-entities"
            placeholder="Choose or type a record type"
          />
        </Field>
        <Field label="Entity ID">
          <Input
            value={params.entityId ?? ""}
            onChange={(e) => state.setFilter("entityId", e.target.value)}
          />
        </Field>
      </section>
      <datalist id="audit-actions">
        {[
          ...new Set([
            "INVOICE_ISSUED",
            ...(report.data?.data.map((item) => item.action) ?? []),
          ]),
        ].map((value) => (
          <option key={value} value={value}>
            {humanize(value)}
          </option>
        ))}
      </datalist>
      <datalist id="audit-entities">
        {[
          ...new Set([
            "INVOICE",
            "CUSTOMER",
            "COMMERCIAL_BOOKING",
            ...(report.data?.data.map((item) => item.entityType) ?? []),
          ]),
        ].map((value) => (
          <option key={value} value={value}>
            {humanize(value)}
          </option>
        ))}
      </datalist>
      <ActiveFilters
        params={params}
        defaults={defaults}
        onClear={state.clear}
      />
      <DateRangeError params={params} />
      {report.isLoading ? (
        <Loading label="Loading audit activity" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportMetaLine meta={report.data.meta} />
          <p className="filter-scope">
            Staff-directory names and roles show current identity, which may
            differ from the time of the event. Record names also show the
            current record. Expand Event details for full IDs and original event
            codes. Field-level before/after changes are not supplied by the
            audit API.
          </p>
          {actors.isError && (
            <div className="notice" role="status">
              <span>
                Some actor details could not be loaded. Audit events are still
                available.
              </span>
              <ClearFiltersButton
                variant="ghost"
                onClick={() => actors.refetch()}
              >
                Retry actor details
              </ClearFiltersButton>
            </div>
          )}
          <SummaryCards
            items={[
              { label: "Audit events", value: report.data.summary.total },
            ]}
          />
          {!report.data.data.length ? (
            <Empty
              action={
                <ClearFiltersButton variant="secondary" onClick={state.clear}>
                  Clear filters
                </ClearFiltersButton>
              }
              title="No audit activity"
              detail="No audit events match the active filters."
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
                          label="Event time"
                          value="createdAt"
                          params={params}
                          update={(values) =>
                            state.update({ ...values, sortBy: null })
                          }
                        />
                      </th>
                      <th>Actor</th>
                      <th>Activity</th>
                      <th>Affected record</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatTimestamp(row.createdAt)}</td>
                        <td title={row.actorId}>
                          <strong>{row.actorName}</strong>
                          <small className="table-sub">
                            {row.actorDetails}
                          </small>
                        </td>
                        <td title={row.action}>{row.activity}</td>
                        <td>
                          <strong>{row.entityLabel}</strong>
                          <small className="table-sub">
                            {humanize(row.entityType)}
                          </small>
                          {row.entityContext && (
                            <small className="table-sub">
                              {row.entityContext}
                            </small>
                          )}
                          {row.entityHref && (
                            <Link className="text-link" href={row.entityHref}>
                              {row.entityLinkLabel}
                            </Link>
                          )}
                        </td>
                        <td>
                          <details className="audit-event-details">
                            <summary>Event details</summary>
                            <dl>
                              <dt>Event ID</dt>
                              <dd>{row.id}</dd>
                              <dt>Actor ID</dt>
                              <dd>{row.actorId || "Unavailable"}</dd>
                              <dt>Entity ID</dt>
                              <dd>{row.entityId || "Unavailable"}</dd>
                              <dt>Entity type</dt>
                              <dd>{row.entityType}</dd>
                              <dt>Action code</dt>
                              <dd>{row.action}</dd>
                            </dl>
                          </details>
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
