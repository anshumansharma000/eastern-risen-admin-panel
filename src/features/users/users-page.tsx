"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Shield } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  api,
  apiFieldError,
  getCollection,
  queryString,
  safeId,
} from "@/lib/api/client";
import type { CoreRole, CoreUser, Resource } from "@/lib/api/contracts";
import { roleLabel } from "@/lib/permissions";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  StatusBadge,
  SuccessNotice,
} from "@/components/ui";

export function UsersPage() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<"new" | "access" | "password" | null>(
    null,
  );
  const [selected, setSelected] = useState<CoreUser | null>(null);
  const [error, setError] = useState<unknown>();
  const list = useQuery({
    queryKey: ["users", page, search.trim(), status],
    queryFn: ({ signal }) =>
      getCollection<CoreUser>(
        `/users${queryString({ page, pageSize: 25, q: search.trim().slice(0, 200), status })}`,
        signal,
      ),
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "POST" | "PATCH";
      body: unknown;
    }) => api<Resource<CoreUser> | void>(path, { method, body }),
    onSuccess: async () => {
      setSuccess("Staff account updated.");
      setDialog(null);
      setSelected(null);
      setError(null);
      await cache.invalidateQueries({ queryKey: ["users"] });
    },
    onError: setError,
  });
  function openDialog(
    next: "new" | "access" | "password",
    user: CoreUser | null = null,
  ) {
    setError(undefined);
    setSelected(user);
    setDialog(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (dialog === "new")
      mutation.mutate({
        path: "/users",
        method: "POST",
        body: {
          username: data.get("username"),
          email: data.get("email"),
          displayName: data.get("displayName"),
          password: data.get("password"),
          role: data.get("role"),
        },
      });
    if (dialog === "access")
      mutation.mutate({
        path: `/users/${safeId(selected!.id)}/access`,
        method: "PATCH",
        body: { role: data.get("role"), status: data.get("status") },
      });
    if (dialog === "password")
      mutation.mutate({
        path: `/users/${safeId(selected!.id)}/password-reset`,
        method: "POST",
        body: { password: data.get("password") },
      });
  }
  const visible = list.data?.data ?? [];
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Identity & role governance</p>
          <h1>Core user access</h1>
          <p>
            Provision staff, assign one Core role, and manage non-destructive
            account lifecycles.
          </p>
        </div>
        <Button onClick={() => openDialog("new")}>
          <Plus size={17} /> Provision user
        </Button>
      </header>
      <div className="notice">
        <Shield />
        <strong>Administrative safeguard</strong>
        <span>
          Access changes and password resets revoke the affected user’s active
          sessions. The final active administrator is protected.
        </span>
      </div>
      {success && <SuccessNotice>{success}</SuccessNotice>}
      <section className="toolbar">
        <Field label="Search staff">
          <Input
            value={search}
            placeholder="Name, username or email…"
            maxLength={200}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Lifecycle status">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
      </section>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} />
      ) : list.data!.data.length === 0 ? (
        <Empty
          title="No Core users found"
          detail={
            search
              ? "No staff match the search. Clear the search to see all staff."
              : "Provision the first staff account after the administrator bootstrap."
          }
          action={
            search ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
              >
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff identity</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!visible.length && (
                  <tr>
                    <td colSpan={6}>
                      <Empty
                        title="No matches on this page"
                        detail="Clear the filter or view another page."
                        action={
                          <Button
                            variant="secondary"
                            onClick={() => setSearch("")}
                          >
                            Clear filter
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                )}
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                    </td>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>{roleLabel(user.role)}</td>
                    <td>
                      <StatusBadge value={user.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            openDialog("access", user);
                          }}
                        >
                          Access
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            openDialog("password", user);
                          }}
                        >
                          <KeyRound size={15} /> Reset password
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...list.data!.pagination} onPage={setPage} />
        </section>
      )}
      {list.data && !list.data.data.length && (
        <Pagination {...list.data.pagination} onPage={setPage} />
      )}
      {dialog && (
        <Modal
          closeDisabled={mutation.isPending}
          title={
            dialog === "new"
              ? "Provision Core user"
              : dialog === "access"
                ? "Change role & access"
                : "Reset password"
          }
          subtitle={selected?.displayName}
          onClose={() => setDialog(null)}
        >
          <form className="record-form" onSubmit={submit}>
            {dialog === "new" && (
              <>
                <Field
                  label="Display name"
                  error={apiFieldError(error, "displayName")}
                >
                  <Input name="displayName" required maxLength={2000} />
                </Field>
                <Field
                  label="Username"
                  error={apiFieldError(error, "username")}
                >
                  <Input
                    name="username"
                    required
                    minLength={3}
                    maxLength={64}
                    pattern="[A-Za-z0-9_.-]+"
                  />
                </Field>
                <Field label="Email" error={apiFieldError(error, "email")}>
                  <Input name="email" type="email" required maxLength={320} />
                </Field>
              </>
            )}
            {dialog !== "password" && (
              <Field
                label="Core role"
                hint="Administrator: configuration, finance and staff access. Data-entry operator: records, invoices and receipts. Report viewer: read-only access."
                error={apiFieldError(error, "role")}
              >
                <Select
                  name="role"
                  defaultValue={selected?.role ?? "CORE_DATA_ENTRY"}
                >
                  {(
                    [
                      "CORE_ADMIN",
                      "CORE_DATA_ENTRY",
                      "CORE_REPORT_VIEWER",
                    ] as CoreRole[]
                  ).map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {dialog === "access" && (
              <Field
                label="Lifecycle status"
                error={apiFieldError(error, "status")}
              >
                <Select name="status" defaultValue={selected?.status}>
                  <option>ACTIVE</option>
                  <option>DEACTIVATED</option>
                  <option>ARCHIVED</option>
                </Select>
              </Field>
            )}
            {dialog !== "access" && (
              <Field
                label={dialog === "new" ? "Temporary password" : "New password"}
                hint="12–128 characters. It will not be stored in this browser."
                error={apiFieldError(error, "password")}
              >
                <Input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </Field>
            )}
            {dialog !== "new" && (
              <div className="notice">
                <span>
                  This action revokes the user’s active sessions immediately.
                </span>
              </div>
            )}
            {Boolean(error) && <ErrorState error={error} />}
            <footer>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Saving…"
                  : dialog === "new"
                    ? "Create user"
                    : dialog === "access"
                      ? "Apply access change"
                      : "Reset password"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
