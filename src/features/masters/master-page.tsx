"use client";

import { recordHref } from "@/lib/routes";

import Link from "next/link";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  api,
  apiFieldError,
  getCollection,
  queryString,
  safeId,
} from "@/lib/api/client";
import type {
  CoreMaster,
  CoreRole,
  CoreStatus,
  Resource,
} from "@/lib/api/contracts";
import { can } from "@/lib/permissions";
import { getAllRecords } from "@/lib/all-records";
import { RecordSelect, RecordChecks } from "@/components/record-select";
import { EntityTabs } from "@/components/entity-tabs";
import { formatINR, normalizeMoney } from "@/lib/money";
import {
  Button,
  Checkbox,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  StatusBadge,
  Textarea,
  SuccessNotice,
} from "@/components/ui";
import type { FieldConfig, MasterConfig } from "./master-config";
import { CustomerAccessDialog } from "@/features/customer-access/customer-access";

class PartialBatchCreateError extends Error {
  constructor(
    public completedCount: number,
    public totalCount: number,
  ) {
    super(
      `${completedCount} of ${totalCount} tax rules were created before a request failed. Close this form and review the list before trying again to avoid duplicates.`,
    );
    this.name = "PartialBatchCreateError";
  }
}

export function MasterPage({
  config,
  role,
}: {
  config: MasterConfig;
  role: CoreRole;
}) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CoreMaster | "new" | null>(null);
  const [accessCustomer, setAccessCustomer] = useState<CoreMaster | null>(null);
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState<unknown>(null);
  const relationshipFields = config.fields.filter(
    (field) => field.type === "relationship" && field.relationship,
  );
  const contextKey = (
    {
      "hotel-rates": "hotelId",
      "vendor-profiles": "vendorId",
      "bank-accounts": "companyId",
    } as Record<string, string>
  )[config.resource];
  const contextId =
    typeof window === "undefined" || !contextKey
      ? ""
      : (new URLSearchParams(window.location.search).get(contextKey) ?? "");
  const query = useMemo(
    () =>
      queryString({
        page,
        pageSize: 25,
        status,
        q: q.trim().slice(0, 200),
        ...(config.customerFilters ? { category } : {}),
        ...(contextId ? { [contextKey]: contextId } : {}),
      }),
    [page, status, category, q, config.customerFilters, contextId, contextKey],
  );
  const records = useQuery({
    queryKey: [config.resource, query, contextId],
    queryFn: ({ signal }) =>
      getCollection<CoreMaster>(`/${config.resource}${query}`, signal),
  });
  const relationshipQueries = useQueries({
    queries: relationshipFields.map((field) => ({
      queryKey: [field.relationship!.resource, "relationship-picker"],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getAllRecords<CoreMaster>(
          `/${field.relationship!.resource}?page=1&pageSize=100`,
          signal,
          getCollection,
        ),
      staleTime: 60_000,
    })),
  });
  const relationshipData = new Map(
    relationshipFields.map((field, index) => [
      field.key,
      relationshipQueries[index]?.data?.data ?? [],
    ]),
  );
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editing !== "new")
        return api<Resource<CoreMaster>>(
          `/${config.resource}/${safeId(editing!.id)}`,
          { method: "PUT", body: payload },
        );

      const batchField = relationshipFields.find(
        (field) => field.relationship?.multipleOnCreate,
      );
      if (!batchField)
        return api<Resource<CoreMaster>>(`/${config.resource}`, {
          method: "POST",
          body: payload,
        });

      const selectedValues = payload[batchField.key] as string[];
      const values: Array<string | null> = selectedValues.length
        ? selectedValues
        : [null];
      const created: Resource<CoreMaster>[] = [];
      for (const value of values) {
        try {
          created.push(
            await api<Resource<CoreMaster>>(`/${config.resource}`, {
              method: "POST",
              body: { ...payload, [batchField.key]: value },
            }),
          );
        } catch (error) {
          if (created.length)
            throw new PartialBatchCreateError(created.length, values.length);
          throw error;
        }
      }
      return created;
    },
    onSuccess: async () => {
      setSuccess(
        `${config.singular.charAt(0).toUpperCase() + config.singular.slice(1)} saved.`,
      );
      setEditing(null);
      setFormError(null);
      await cache.invalidateQueries({ queryKey: [config.resource] });
    },
    onError: async (error) => {
      setFormError(error);
      if (error instanceof PartialBatchCreateError)
        await cache.invalidateQueries({ queryKey: [config.resource] });
    },
  });
  const editable = can(role, config.capability);
  function openEditor(record: CoreMaster | "new") {
    setSuccess("");
    setFormError(null);
    setEditing(record);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    config.fields.forEach((field) => {
      if (field.type === "checkbox") {
        payload[field.key] = data.has(field.key);
        return;
      }
      if (
        editing === "new" &&
        field.type === "relationship" &&
        field.relationship?.multipleOnCreate
      ) {
        payload[field.key] = data
          .getAll(field.key)
          .map(String)
          .map((value) => value.trim())
          .filter(Boolean);
        return;
      }
      let value: string | null = String(data.get(field.key) ?? "").trim();
      if (field.type === "money" && value) value = normalizeMoney(value);
      if (field.required || value) payload[field.key] = value || null;
      else payload[field.key] = null;
    });
    payload.status = data.get("status") || "ACTIVE";
    if (editing && editing !== "new") payload.version = editing.version;
    save.mutate(payload);
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        {editable && (
          <Button onClick={() => openEditor("new")}>
            <Plus size={17} /> New {config.singular}
          </Button>
        )}
      </header>
      <EntityTabs resource={config.resource} />
      {contextId && (
        <p className="context-banner">
          Showing records for{" "}
          {String(
            relationshipData
              .get(contextKey)
              ?.find((item) => item.id === contextId)?.name ??
              "the selected record",
          )}
          .{" "}
          <Link
            className="text-link"
            href={
              config.resource === "hotel-rates"
                ? "/hotel-rates"
                : config.resource === "vendor-profiles"
                  ? "/vendor-profiles"
                  : "/bank-accounts"
            }
          >
            View all
          </Link>
        </p>
      )}
      {success && <SuccessNotice>{success}</SuccessNotice>}
      <section className="toolbar">
        <div className="search-control">
          <Search size={17} />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${config.title.toLowerCase()}…`}
            maxLength={200}
            aria-label="Search"
          />
        </div>
        {config.customerFilters && (
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            aria-label="Customer category"
          >
            <option value="">All categories</option>
            <option value="AGENT">Agent</option>
            <option value="LEISURE">Leisure</option>
            <option value="CORPORATE">Corporate</option>
          </Select>
        )}
        <div className="select-icon">
          <SlidersHorizontal size={16} />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Lifecycle status"
          >
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
            <option>ARCHIVED</option>
          </Select>
        </div>
      </section>
      {records.isLoading ? (
        <Loading label={`Loading ${config.title.toLowerCase()}`} />
      ) : records.isError ? (
        <ErrorState error={records.error} onRetry={() => records.refetch()} />
      ) : records.data!.data.length === 0 ? (
        <Empty
          title={`No ${config.title.toLowerCase()} found`}
          action={
            q || status || category ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setStatus("");
                  setCategory("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : editable ? (
              <Button onClick={() => openEditor("new")}>
                New {config.singular}
              </Button>
            ) : undefined
          }
          detail={
            q || status || category
              ? "Try adjusting the current filters."
              : `Create the first ${config.singular} when you are ready.`
          }
        />
      ) : (
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {config.columns.map((column) => (
                    <th key={column}>
                      {config.fields.find((field) => field.key === column)
                        ?.label ?? label(column)}
                    </th>
                  ))}
                  <th>Status</th>
                  {(editable ||
                    config.resource === "customers" ||
                    config.resource === "hotels" ||
                    config.resource === "companies") && (
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {records.data!.data.map((record) => (
                  <tr key={record.id}>
                    {config.columns.map((column, index) => (
                      <td key={column}>
                        {index === 0 ? (
                          <strong>
                            {config.resource === "guests" ? (
                              <Link
                                className="text-link"
                                href={recordHref("guest-activity", record.id)}
                              >
                                {display(record[column])}
                              </Link>
                            ) : (
                              displayMasterValue(
                                record,
                                column,
                                config.fields,
                                relationshipData,
                              )
                            )}
                          </strong>
                        ) : (
                          displayMasterValue(
                            record,
                            column,
                            config.fields,
                            relationshipData,
                          )
                        )}
                      </td>
                    ))}
                    <td>
                      <StatusBadge value={record.status} />
                    </td>
                    {(editable ||
                      config.resource === "customers" ||
                      config.resource === "hotels" ||
                      config.resource === "companies") && (
                      <td>
                        {config.resource === "hotels" && (
                          <Link
                            className="button button-ghost"
                            href={`/hotel-rates?hotelId=${encodeURIComponent(record.id)}`}
                          >
                            Manage rates
                          </Link>
                        )}
                        {config.resource === "companies" && (
                          <Link
                            className="button button-ghost"
                            href={`/bank-accounts?companyId=${encodeURIComponent(record.id)}`}
                          >
                            Bank accounts
                          </Link>
                        )}
                        {config.resource === "customers" && (
                          <Link
                            className="button button-ghost"
                            href={recordHref("customer-statement", record.id)}
                          >
                            Statement
                          </Link>
                        )}
                        {config.resource === "customers" &&
                          role === "CORE_ADMIN" && (
                            <Button
                              variant="ghost"
                              onClick={() => setAccessCustomer(record)}
                            >
                              Account access
                            </Button>
                          )}
                        {editable && (
                          <Button
                            variant="ghost"
                            onClick={() => openEditor(record)}
                          >
                            Edit
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...records.data!.pagination} onPage={setPage} />
        </section>
      )}
      {records.data && !records.data.data.length && (
        <Pagination {...records.data.pagination} onPage={setPage} />
      )}
      {editing && (
        <Modal
          closeDisabled={save.isPending}
          title={`${editing === "new" ? "Create" : "Edit"} ${config.singular}`}
          subtitle={
            editing === "new"
              ? "Add a new Core record."
              : "Update this record’s details."
          }
          onClose={() => setEditing(null)}
        >
          {relationshipQueries.some((item) => item.isLoading) ? (
            <Loading label="Loading selection options" />
          ) : relationshipQueries.some((item) => item.isError) ? (
            <ErrorState
              error={relationshipQueries.find((item) => item.error)?.error}
              onRetry={() =>
                relationshipQueries.forEach((item) => {
                  if (item.isError) void item.refetch();
                })
              }
            />
          ) : (
            <form className="record-form" onSubmit={submit}>
              {groupFields(config.fields).map((group) => (
                <details
                  className="record-form-group grouped-fields"
                  key={group.label}
                  open={group.label !== "Historical information"}
                >
                  <summary>{group.label}</summary>
                  <div className="record-form-grid">
                    {group.fields.map((field) => (
                      <Field
                        key={field.key}
                        label={field.label}
                        hint={field.hint}
                        error={apiFieldError(formError, field.key)}
                      >
                        {field.type === "textarea" ? (
                          <Textarea
                            name={field.key}
                            defaultValue={
                              editing === "new"
                                ? ""
                                : String(editing[field.key] ?? "")
                            }
                            required={field.required}
                            maxLength={field.required ? 2000 : 4000}
                          />
                        ) : field.type === "select" ? (
                          <Select
                            name={field.key}
                            defaultValue={
                              editing === "new"
                                ? (field.options?.[0]?.value ?? "")
                                : String(editing[field.key] ?? "")
                            }
                            required={field.required}
                          >
                            {field.options?.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        ) : field.type === "relationship" &&
                          field.relationship ? (
                          <RelationshipSelect
                            field={field}
                            records={relationshipData.get(field.key) ?? []}
                            editing={editing}
                            prefill={field.key === contextKey ? contextId : ""}
                          />
                        ) : field.type === "checkbox" ? (
                          <span className="checkbox-row">
                            <Checkbox
                              name={field.key}
                              aria-label={field.label}
                              defaultChecked={
                                editing !== "new" && editing[field.key] === true
                              }
                            />
                            <span>Required for invoices in this category</span>
                          </span>
                        ) : (
                          <Input
                            name={field.key}
                            type={
                              field.type === "money"
                                ? "text"
                                : (field.type ?? "text")
                            }
                            inputMode={
                              field.type === "money" ? "decimal" : undefined
                            }
                            defaultValue={
                              editing === "new"
                                ? ""
                                : String(editing[field.key] ?? "")
                            }
                            required={field.required}
                            maxLength={field.required ? 2000 : 4000}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                </details>
              ))}
              <Field label="Status" error={apiFieldError(formError, "status")}>
                <Select
                  name="status"
                  defaultValue={editing === "new" ? "ACTIVE" : editing.status}
                >
                  {(["ACTIVE", "INACTIVE", "ARCHIVED"] as CoreStatus[]).map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </Select>
              </Field>
              {Boolean(formError) && <ErrorState error={formError} />}
              <footer>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    save.isPending ||
                    formError instanceof PartialBatchCreateError ||
                    (editing === "new" &&
                      relationshipFields.some(
                        (field) =>
                          field.required &&
                          !(relationshipData.get(field.key) ?? []).some(
                            (record) => record.status === "ACTIVE",
                          ),
                      ))
                  }
                >
                  {save.isPending
                    ? "Saving…"
                    : editing === "new"
                      ? `Create ${config.singular}`
                      : "Save changes"}
                </Button>
              </footer>
            </form>
          )}
        </Modal>
      )}
      {accessCustomer && role === "CORE_ADMIN" && (
        <CustomerAccessDialog
          customer={accessCustomer}
          role={role}
          onClose={() => setAccessCustomer(null)}
        />
      )}
    </>
  );
}

function RelationshipSelect({
  id,
  field,
  records,
  editing,
  prefill = "",
}: {
  id?: string;
  prefill?: string;
  field: FieldConfig;
  records: CoreMaster[];
  editing: CoreMaster | "new";
}) {
  const relationship = field.relationship!;
  const currentValue =
    editing === "new" ? prefill : String(editing[field.key] ?? "");
  const options = records.filter(
    (record) => record.status === "ACTIVE" || record.id === currentValue,
  );
  const multiple = editing === "new" && Boolean(relationship.multipleOnCreate);

  const [value, setValue] = useState(currentValue);
  const namedOptions = options.map((record) => ({
    id: record.id,
    label: `${String(record[relationship.displayKey])}${record.status === "ACTIVE" ? "" : ` (${record.status.toLowerCase()})`}`,
  }));
  if (multiple)
    return (
      <RecordChecks
        label={field.label}
        name={field.key}
        options={namedOptions}
        defaultValues={[]}
      />
    );
  return (
    <RecordSelect
      id={id}
      label={field.label}
      name={field.key}
      required={field.required}
      disabled={field.required && editing === "new" && !options.length}
      options={namedOptions}
      value={value}
      onChange={setValue}
      placeholder={
        options.length
          ? relationship.placeholder
          : `No active ${relationship.resource} available`
      }
    />
  );
}

function displayMasterValue(
  record: CoreMaster,
  column: string,
  fields: FieldConfig[],
  relationshipData: Map<string, CoreMaster[]>,
) {
  const field = fields.find((candidate) => candidate.key === column);
  if (field?.type === "relationship" && field.relationship) {
    const related = relationshipData
      .get(field.key)
      ?.find((candidate) => candidate.id === record[column]);
    if (related) return display(related[field.relationship.displayKey]);
  }
  if (field?.type === "money") return formatINR(String(record[column] ?? ""));
  if (column === "rate" && record[column] != null) return `${record[column]}%`;
  if (field?.type === "checkbox")
    return record[column] === true ? (
      <span className="status status-active">Required</span>
    ) : (
      <span className="status status-inactive">Not required</span>
    );
  return display(record[column]);
}

function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
function display(value: unknown) {
  if (value === null || value === undefined || value === "")
    return <span className="muted">Not provided</span>;
  if (typeof value === "string" && /At$/.test(value))
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  return String(value).replaceAll("_", " ");
}

function groupFields(fields: FieldConfig[]) {
  const contact = new Set([
    "address",
    "city",
    "state",
    "country",
    "postalCode",
    "phone",
    "mobileNumber",
    "email",
    "contactPerson",
  ]);
  const tax = new Set(["pan", "gstNumber", "serviceTaxNumber", "cin"]);
  const groups = [
    {
      label: "Basic details",
      fields: fields.filter(
        (field) =>
          !contact.has(field.key) &&
          !tax.has(field.key) &&
          !field.key.startsWith("legacy"),
      ),
    },
    {
      label: "Contact & address",
      fields: fields.filter((field) => contact.has(field.key)),
    },
    {
      label: "Tax & registration",
      fields: fields.filter((field) => tax.has(field.key)),
    },
    {
      label: "Historical information",
      fields: fields.filter((field) => field.key.startsWith("legacy")),
    },
  ];
  return groups.filter((group) => group.fields.length);
}
