"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  api,
  apiFieldError,
  getCollection,
  queryString,
  safeId,
} from "@/lib/api/client";
import type { CatalogStatus, CoreRole, Resource } from "@/lib/api/contracts";
import { EntityTabs } from "@/components/entity-tabs";
import { can } from "@/lib/permissions";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Pagination,
  StatusBadge,
  Select,
  SuccessNotice,
} from "@/components/ui";

type CatalogRecord = {
  id: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};
export function CatalogPage({ role }: { kind: "vendors"; role: CoreRole }) {
  const kind = "vendors";
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CatalogRecord | "new" | null>(null);
  const [error, setError] = useState<unknown>();
  const list = useQuery({
    queryKey: [kind, page, q.trim(), status],
    queryFn: ({ signal }) =>
      getCollection<CatalogRecord>(
        `/${kind}${queryString({ page, pageSize: 25, q: q.trim().slice(0, 200), status })}`,
        signal,
      ),
  });
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing === "new"
        ? api<Resource<CatalogRecord>>(`/${kind}`, {
            method: "POST",
            body: payload,
          })
        : api<Resource<CatalogRecord>>(`/${kind}/${safeId(editing!.id)}`, {
            method: "PUT",
            body: payload,
          }),
    onSuccess: async () => {
      setSuccess("Vendor saved.");
      setEditing(null);
      await cache.invalidateQueries({ queryKey: [kind] });
    },
    onError: setError,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CatalogStatus }) =>
      api(`/${kind}/${safeId(id)}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      setSuccess("Vendor status updated.");
      return cache.invalidateQueries({ queryKey: [kind] });
    },
    onError: setError,
  });
  const visible = list.data?.data ?? [];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    ["name", "contactName", "contactEmail", "contactPhone"].forEach((key) => {
      const value = String(data.get(key) ?? "").trim();
      if (value) payload[key] = value;
    });
    save.mutate(payload);
  }
  function openEditor(record: CatalogRecord | "new") {
    setError(undefined);
    setEditing(record);
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Shared catalog + Core profile</p>
          <h1>Vendors & profiles</h1>
          <p>
            Shared supplier identity with separately owned Core location
            details.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button button-secondary" href="/vendor-profiles">
            Core profiles
          </Link>
          {can(role, "writeOperational") && (
            <Button onClick={() => openEditor("new")}>
              <Plus size={17} /> Add vendor
            </Button>
          )}
        </div>
      </header>
      <EntityTabs resource="vendors" />
      {success && <SuccessNotice>{success}</SuccessNotice>}
      <details className="help-details">
        <summary>About vendor details</summary>
        <div className="notice">
          <strong>Vendor contact and address</strong>
          <span>
            Contact details are saved here. Use Additional details for the
            vendor’s address and market.
          </span>
        </div>
      </details>
      <section className="toolbar">
        <div className="search-control">
          <Search size={17} />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${kind}…`}
            maxLength={200}
            aria-label={`Search ${kind}`}
          />
        </div>
        <Field label="Lifecycle status">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Active and deactivated</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
      </section>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : visible.length === 0 ? (
        <Empty
          action={
            q ? (
              <Button variant="secondary" onClick={() => setQ("")}>
                Clear filter
              </Button>
            ) : can(role, "writeOperational") ? (
              <Button onClick={() => openEditor("new")}>Add vendor</Button>
            ) : undefined
          }
          title={`No ${kind} found`}
          detail={
            q ? "No vendors match the search." : "The shared catalog is empty."
          }
        />
      ) : (
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Contact person</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{String(item.name ?? "—")}</strong>
                      <small className="table-sub">{item.id}</small>
                    </td>
                    <td>{String(item.contactName ?? "Not provided")}</td>
                    <td>{String(item.contactEmail ?? "Not provided")}</td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="button button-ghost"
                          href={`/vendor-profiles?vendorId=${encodeURIComponent(item.id)}`}
                        >
                          Additional details
                        </Link>
                        {can(role, "writeOperational") && (
                          <Button
                            variant="ghost"
                            onClick={() => openEditor(item)}
                          >
                            Edit
                          </Button>
                        )}
                        {can(role, "writeConfiguration") &&
                          item.status !== "ARCHIVED" && (
                            <Button
                              variant="ghost"
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: item.id,
                                  status:
                                    item.status === "ACTIVE"
                                      ? "DEACTIVATED"
                                      : "ACTIVE",
                                })
                              }
                            >
                              {item.status === "ACTIVE"
                                ? "Deactivate"
                                : "Activate"}
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pagination {...list.data.pagination} onPage={setPage} />
          )}
        </section>
      )}
      {list.data && !visible.length && (
        <Pagination {...list.data.pagination} onPage={setPage} />
      )}
      {error && !editing && <ErrorState error={error} />}
      {editing && (
        <Modal
          closeDisabled={save.isPending}
          title={`${editing === "new" ? "Add" : "Edit"} vendor`}
          subtitle="Shared catalog record"
          onClose={() => setEditing(null)}
        >
          <form className="record-form" onSubmit={submit}>
            <Field label="Vendor name" error={apiFieldError(error, "name")}>
              <Input
                name="name"
                required
                maxLength={200}
                defaultValue={
                  editing === "new" ? "" : String(editing.name ?? "")
                }
              />
            </Field>
            <Field
              label="Contact person"
              error={apiFieldError(error, "contactName")}
            >
              <Input
                name="contactName"
                maxLength={200}
                defaultValue={
                  editing === "new" ? "" : String(editing.contactName ?? "")
                }
              />
            </Field>
            <Field
              label="Contact email"
              error={apiFieldError(error, "contactEmail")}
            >
              <Input
                name="contactEmail"
                type="email"
                maxLength={320}
                defaultValue={
                  editing === "new" ? "" : String(editing.contactEmail ?? "")
                }
              />
            </Field>
            <Field label="Phone" error={apiFieldError(error, "contactPhone")}>
              <Input
                name="contactPhone"
                maxLength={64}
                defaultValue={
                  editing === "new" ? "" : String(editing.contactPhone ?? "")
                }
              />
            </Field>
            {Boolean(error) && <ErrorState error={error} />}
            <footer>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save vendor"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
