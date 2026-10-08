"use client";

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
import type {
  CatalogStatus,
  CoreRole,
  Resource,
  Vehicle,
} from "@/lib/api/contracts";
import { can, canManageVehicleLifecycle } from "@/lib/permissions";
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
  Textarea,
  SuccessNotice,
} from "@/components/ui";

const requiredVehicleFields = [
  "registrationNumber",
  "displayName",
  "vehicleType",
] as const;
const optionalVehicleFields = [
  "registeredOwner",
  "address",
  "contactNumber",
  "accountNumber",
  "ifscCode",
  "bankName",
] as const;

export type VehiclePayload = Pick<
  Vehicle,
  (typeof requiredVehicleFields)[number]
> &
  Pick<Vehicle, (typeof optionalVehicleFields)[number]>;

export function buildVehiclePayload(data: FormData): VehiclePayload {
  const required = Object.fromEntries(
    requiredVehicleFields.map((key) => [
      key,
      String(data.get(key) ?? "").trim(),
    ]),
  ) as Pick<VehiclePayload, (typeof requiredVehicleFields)[number]>;
  const optional = Object.fromEntries(
    optionalVehicleFields.map((key) => {
      const value = String(data.get(key) ?? "").trim();
      return [key, value || null];
    }),
  ) as Pick<VehiclePayload, (typeof optionalVehicleFields)[number]>;
  return { ...required, ...optional };
}

export function VehiclesPage({ role }: { role: CoreRole }) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [error, setError] = useState<unknown>();
  const canWrite = can(role, "writeOperational");
  const canChangeStatus = canManageVehicleLifecycle(role);
  const list = useQuery({
    queryKey: ["vehicles", page, q.trim(), status],
    queryFn: ({ signal }) =>
      getCollection<Vehicle>(
        `/vehicles${queryString({ page, pageSize: 25, q: q.trim().slice(0, 200), status })}`,
        signal,
      ),
  });
  const save = useMutation({
    mutationFn: (payload: VehiclePayload) =>
      editing === "new"
        ? api<Resource<Vehicle>>("/vehicles", {
            method: "POST",
            body: payload,
          })
        : api<Resource<Vehicle>>(`/vehicles/${safeId(editing!.id)}`, {
            method: "PUT",
            body: payload,
          }),
    onSuccess: async () => {
      setSuccess("Vehicle saved.");
      setEditing(null);
      setError(undefined);
      await cache.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: setError,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CatalogStatus }) =>
      api(`/vehicles/${safeId(id)}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: async () => {
      setSuccess("Vehicle status updated.");
      setError(undefined);
      await cache.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: setError,
  });
  const visible = list.data?.data ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    save.mutate(buildVehiclePayload(new FormData(event.currentTarget)));
  }
  function openEditor(record: Vehicle | "new") {
    setError(undefined);
    setEditing(record);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Fleet registry</p>
          <h1>Vehicles</h1>
          <p>
            Vehicle, registered-owner, and owner banking details are saved
            together as one record.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => openEditor("new")}>
            <Plus size={17} /> Add vehicle
          </Button>
        )}
      </header>
      {success && <SuccessNotice>{success}</SuccessNotice>}
      <section className="toolbar">
        <div className="search-control">
          <Search size={17} />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Search registration, name or owner…"
            maxLength={200}
            aria-label="Search vehicles"
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
        <Loading label="Loading vehicles" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : visible.length === 0 ? (
        <Empty
          action={
            q ? (
              <Button variant="secondary" onClick={() => setQ("")}>
                Clear filter
              </Button>
            ) : canWrite ? (
              <Button onClick={() => openEditor("new")}>Add vehicle</Button>
            ) : undefined
          }
          title="No vehicles found"
          detail={
            q
              ? "No vehicles match the search."
              : "Create the first vehicle when you are ready."
          }
        />
      ) : (
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Registration number</th>
                  <th>Display name</th>
                  <th>Vehicle type</th>
                  <th>Registered owner</th>
                  <th>Bank name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((vehicle) => {
                  const archived = vehicle.status === "ARCHIVED";
                  return (
                    <tr key={vehicle.id}>
                      <td>
                        <strong>{vehicle.registrationNumber}</strong>
                      </td>
                      <td>{vehicle.displayName}</td>
                      <td>{vehicle.vehicleType}</td>
                      <td>{displayOptional(vehicle.registeredOwner)}</td>
                      <td>{displayOptional(vehicle.bankName)}</td>
                      <td>
                        <StatusBadge value={vehicle.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {canWrite && !archived && (
                            <Button
                              variant="ghost"
                              onClick={() => openEditor(vehicle)}
                            >
                              Edit
                            </Button>
                          )}
                          {canChangeStatus && !archived && (
                            <>
                              <Button
                                variant="ghost"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: vehicle.id,
                                    status:
                                      vehicle.status === "ACTIVE"
                                        ? "DEACTIVATED"
                                        : "ACTIVE",
                                  })
                                }
                              >
                                {vehicle.status === "ACTIVE"
                                  ? "Deactivate"
                                  : "Activate"}
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={statusMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Archive ${vehicle.registrationNumber}? It will become read-only and unavailable for new invoices.`,
                                    )
                                  )
                                    statusMutation.mutate({
                                      id: vehicle.id,
                                      status: "ARCHIVED",
                                    });
                                }}
                              >
                                Archive
                              </Button>
                            </>
                          )}
                          {((!canWrite && !canChangeStatus) || archived) && (
                            <span className="muted">
                              {archived ? "Archived — read only" : "Read only"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          title={`${editing === "new" ? "Add" : "Edit"} vehicle`}
          subtitle="All vehicle and owner details are saved in one operation."
          onClose={() => {
            setEditing(null);
            setError(undefined);
          }}
        >
          <form className="record-form vehicle-form" onSubmit={submit}>
            <fieldset className="record-form-group">
              <legend>Vehicle details</legend>
              <div className="record-form-grid">
                <Field
                  label="Registration number"
                  error={apiFieldError(error, "registrationNumber")}
                >
                  <Input
                    name="registrationNumber"
                    required
                    maxLength={64}
                    autoFocus
                    defaultValue={valueOf(editing, "registrationNumber")}
                  />
                </Field>
                <Field
                  label="Display name"
                  error={apiFieldError(error, "displayName")}
                >
                  <Input
                    name="displayName"
                    required
                    maxLength={200}
                    defaultValue={valueOf(editing, "displayName")}
                  />
                </Field>
                <Field
                  label="Vehicle type"
                  error={apiFieldError(error, "vehicleType")}
                >
                  <Input
                    name="vehicleType"
                    required
                    maxLength={100}
                    defaultValue={valueOf(editing, "vehicleType")}
                  />
                </Field>
              </div>
            </fieldset>
            <fieldset className="record-form-group">
              <legend>Owner details</legend>
              <p>All owner-scoped fields are optional.</p>
              <div className="record-form-grid">
                <Field
                  label="Registered owner"
                  error={apiFieldError(error, "registeredOwner")}
                >
                  <Input
                    name="registeredOwner"
                    maxLength={200}
                    defaultValue={valueOf(editing, "registeredOwner")}
                  />
                </Field>
                <Field
                  label="Contact number"
                  error={apiFieldError(error, "contactNumber")}
                >
                  <Input
                    name="contactNumber"
                    type="tel"
                    maxLength={64}
                    defaultValue={valueOf(editing, "contactNumber")}
                  />
                </Field>
                <Field
                  label="Owner address"
                  error={apiFieldError(error, "address")}
                >
                  <Textarea
                    name="address"
                    maxLength={2000}
                    defaultValue={valueOf(editing, "address")}
                  />
                </Field>
              </div>
            </fieldset>
            <fieldset className="record-form-group">
              <legend>Bank details</legend>
              <p>Owner banking fields are optional and stored as text.</p>
              <div className="record-form-grid">
                <Field
                  label="Account number"
                  hint="Leading zeroes are preserved."
                  error={apiFieldError(error, "accountNumber")}
                >
                  <Input
                    name="accountNumber"
                    maxLength={128}
                    defaultValue={valueOf(editing, "accountNumber")}
                  />
                </Field>
                <Field
                  label="IFSC code"
                  error={apiFieldError(error, "ifscCode")}
                >
                  <Input
                    name="ifscCode"
                    maxLength={32}
                    defaultValue={valueOf(editing, "ifscCode")}
                  />
                </Field>
                <Field
                  label="Bank name"
                  error={apiFieldError(error, "bankName")}
                >
                  <Input
                    name="bankName"
                    maxLength={200}
                    defaultValue={valueOf(editing, "bankName")}
                  />
                </Field>
              </div>
            </fieldset>
            {Boolean(error) && <ErrorState error={error} />}
            <footer>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save vehicle"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}

function valueOf(vehicle: Vehicle | "new", key: keyof VehiclePayload): string {
  return vehicle === "new" ? "" : String(vehicle[key] ?? "");
}

function displayOptional(value: string | null) {
  return value ? value : <span className="muted">Not provided</span>;
}
