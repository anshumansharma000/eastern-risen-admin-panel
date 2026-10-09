"use client";

import { recordHref } from "@/lib/routes";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  apiFieldError,
  getCollection,
  getResource,
  safeId,
} from "@/lib/api/client";
import type {
  CoreMaster,
  Invoice,
  Resource,
  ServiceCategory,
  Vehicle,
} from "@/lib/api/contracts";
import { getAllRecords } from "@/lib/all-records";
import { useFormGuard } from "@/components/form-guard";
import { RecordSelect, RecordChecks } from "@/components/record-select";
import { CustomerCreateDialog } from "@/features/masters/customer-create-dialog";
import { normalizeMoney } from "@/lib/money";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Loading,
  Select,
  Textarea,
} from "@/components/ui";

type Line = {
  clientId: string;
  description: string;
  amount: string;
  taxTreatment: "TAXABLE" | "NON_TAXABLE" | "EXEMPT" | "NIL_RATED";
  taxMode: "IGST" | "CGST_SGST";
};
const emptyLine = (): Line => ({
  clientId: crypto.randomUUID(),
  description: "",
  amount: "",
  taxTreatment: "TAXABLE",
  taxMode: "IGST",
});
export function InvoiceEditor({ id }: { id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCompanyId = id ? "" : (searchParams.get("companyId") ?? "");
  const prefillCustomerId = id ? "" : (searchParams.get("customerId") ?? "");
  const prefillServiceCategoryId = id
    ? ""
    : (searchParams.get("serviceCategoryId") ?? "");
  const cache = useQueryClient();
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<unknown>();
  const [dirty, setDirty] = useState(false);
  const [companyId, setCompanyId] = useState(prefillCompanyId);
  const [customerId, setCustomerId] = useState(prefillCustomerId);
  const [guestId, setGuestId] = useState("");
  const [newCustomer, setNewCustomer] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<CoreMaster | null>(
    null,
  );
  const hydrated = useRef<string | null>(null);
  const [customerCategory, setCustomerCategory] = useState("");
  const [serviceCategoryId, setServiceCategoryId] = useState(
    prefillServiceCategoryId,
  );
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const detail = useQuery({
    queryKey: ["invoice", id],
    queryFn: ({ signal }) =>
      getResource<Invoice>(`/invoices/${safeId(id!)}`, signal),
    enabled: Boolean(id),
  });
  const masters = useQueries({
    queries: [
      "companies",
      "customers",
      "guests",
      "service-categories",
      "bank-accounts",
    ].map((resource) => ({
      queryKey: [resource, "picker"],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getAllRecords<CoreMaster>(
          `/${resource}?page=1&pageSize=100&status=ACTIVE`,
          signal,
          getCollection,
        ),
      staleTime: 60_000,
    })),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", "invoice-picker"],
    queryFn: ({ signal }) =>
      getAllRecords<Vehicle>(
        "/vehicles?page=1&pageSize=100",
        signal,
        getCollection,
      ),
    staleTime: 60_000,
  });
  const prefilledCategory = useQuery({
    queryKey: [
      "service-categories",
      prefillServiceCategoryId,
      "invoice-prefill",
    ],
    queryFn: ({ signal }) =>
      getResource<ServiceCategory>(
        `/service-categories/${safeId(prefillServiceCategoryId)}`,
        signal,
      ),
    enabled: Boolean(prefillServiceCategoryId) && !id,
  });
  useEffect(() => {
    const invoice = detail.data?.data;
    if (invoice?.lines && vehicles.data && hydrated.current !== invoice.id) {
      hydrated.current = invoice.id;
      setCompanyId(invoice.companyId);
      setCustomerId(invoice.customerId);
      setGuestId(invoice.guestId ?? "");
      // Populate controlled rows once the requested draft arrives.
      setLines(
        invoice.lines.map((line) => ({
          clientId: line.id ?? crypto.randomUUID(),
          description: line.description,
          amount: line.amount,
          taxTreatment: line.taxTreatment,
          taxMode: line.appliedTaxes?.some((tax) => tax.component === "IGST")
            ? "IGST"
            : "CGST_SGST",
        })),
      );
      setServiceCategoryId(invoice.serviceCategoryId);
      const initialVehicleId =
        invoice.details?.vehicleId ?? invoice.vehicleId ?? "";
      const initialVehicle = vehicles.data?.data.find(
        (vehicle) =>
          vehicle.id === initialVehicleId && vehicle.status === "ACTIVE",
      );
      setVehicleId(initialVehicle?.id ?? "");
      setVehicleSearch(
        initialVehicle ? vehicleOptionLabel(initialVehicle) : "",
      );
    }
  }, [detail.data, vehicles.data]);
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      id
        ? api<Resource<Invoice>>(`/invoices/${safeId(id)}`, {
            method: "PUT",
            body: { ...payload, version: detail.data!.data.version },
          })
        : api<Resource<Invoice>>("/invoices", {
            method: "POST",
            body: payload,
          }),
    onSuccess: async (result) => {
      clearGuard();
      setDirty(false);
      await cache.invalidateQueries({ queryKey: ["invoices"] });
      router.push(recordHref("invoice-detail", result.data.id));
    },
    onError: setError,
  });
  const clearGuard = useFormGuard(dirty, save.isPending);
  const masterData = (index: number) => masters[index].data?.data ?? [];
  const serviceCategories = [
    ...masterData(3),
    ...(prefilledCategory.data &&
    !masterData(3).some((item) => item.id === prefilledCategory.data.data.id)
      ? [prefilledCategory.data.data]
      : []),
  ] as ServiceCategory[];
  const selectedServiceCategory = serviceCategories.find(
    (category) => category.id === serviceCategoryId,
  );
  const activeVehicles =
    vehicles.data?.data.filter((vehicle) => vehicle.status === "ACTIVE") ?? [];
  function move(index: number, offset: number) {
    const next = [...lines];
    const [line] = next.splice(index, 1);
    next.splice(index + offset, 0, line);
    setLines(next);
    setDirty(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const payloadLines = lines.map((line) => ({
      description: line.description.trim(),
      amount: normalizeMoney(line.amount),
      taxTreatment: line.taxTreatment,
      taxComponents:
        line.taxTreatment === "TAXABLE"
          ? line.taxMode === "IGST"
            ? ["IGST"]
            : ["CGST", "SGST"]
          : [],
    }));
    if (payloadLines.some((line) => !line.description || !line.amount)) {
      setError(
        new Error(
          "Every line needs a description and a valid amount with at most two decimal places.",
        ),
      );
      return;
    }
    const requiresVehicle = selectedServiceCategory?.requiresVehicle === true;
    if (requiresVehicle && !vehicleId) {
      setError(
        new Error("Select an active vehicle for this service category."),
      );
      return;
    }
    const bankAccountIds = data.getAll("bankAccountIds").map(String);
    if (
      bankAccountIds.length > 10 ||
      bankAccountIds.some(
        (value) =>
          !masterData(4).some(
            (item) => item.id === value && item.companyId === companyId,
          ),
      )
    ) {
      setError(
        new Error(
          "Choose up to 10 bank accounts belonging to the issuing company.",
        ),
      );
      return;
    }
    const payload = {
      companyId: data.get("companyId"),
      customerId: data.get("customerId"),
      guestId: data.get("guestId") || null,
      guestDisplayText: data.get("guestDisplayText"),
      passengerCount: data.get("passengerCount")
        ? Number(data.get("passengerCount"))
        : null,
      serviceCategoryId: data.get("serviceCategoryId"),
      vehicleId: requiresVehicle ? vehicleId : null,
      invoiceDate: data.get("invoiceDate"),
      dueDate: data.get("dueDate") || null,
      serviceProvidedAt: data.get("serviceProvidedAt"),
      placeOfSupplyState: data.get("placeOfSupplyState"),
      placeOfSupplyCountry: data.get("placeOfSupplyCountry"),
      label: data.get("label") || null,
      bankAccountIds,
      lines: payloadLines,
    };
    save.mutate(payload);
  }
  if (
    (id && detail.isLoading) ||
    masters.some((item) => item.isLoading) ||
    vehicles.isLoading ||
    prefilledCategory.isLoading
  )
    return <Loading label="Preparing invoice editor" />;
  const loadError =
    detail.error ??
    masters.find((item) => item.error)?.error ??
    vehicles.error ??
    prefilledCategory.error;
  if (loadError) return <ErrorState error={loadError} />;
  const current = detail.data?.data;
  if (current && current.status !== "DRAFT")
    return (
      <div className="access-denied inline">
        <p className="eyebrow">Read-only document</p>
        <h1>This invoice can no longer be edited.</h1>
        <p>
          Issued and cancelled invoices preserve their stored document values.
        </p>
        <Link
          className="button button-secondary"
          href={recordHref("invoice-detail", current.id)}
        >
          Open invoice detail
        </Link>
      </div>
    );
  return (
    <>
      <header className="page-header compact">
        <div>
          <Link
            className="back-link"
            href={id ? recordHref("invoice-detail", id) : "/invoices"}
          >
            <ArrowLeft size={16} /> Back to {id ? "invoice" : "invoices"}
          </Link>
          <p className="eyebrow">Draft workspace</p>
          <h1>{id ? "Edit draft invoice" : "New draft invoice"}</h1>
          <p>
            Save and calculate first. You’ll review server-calculated taxes
            before issuing.
          </p>
        </div>
      </header>
      <form
        className="invoice-form"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <fieldset className="invoice-form-fields" disabled={save.isPending}>
          <section className="form-section">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2>Parties & classification</h2>
                <p>Choose the issuing entity and who owes the invoice.</p>
              </div>
            </div>
            <div className="form-grid">
              <Field
                label="Issuing company"
                error={apiFieldError(error, "companyId")}
              >
                <RecordSelect
                  name="companyId"
                  label="Issuing company"
                  required
                  value={companyId}
                  onChange={(value) => {
                    setCompanyId(value);
                    setDirty(true);
                  }}
                  placeholder="Select company"
                  options={masterData(0).map((item) => ({
                    id: item.id,
                    label: String(item.name),
                  }))}
                />
              </Field>
              <Field label="Customer category">
                <Select
                  aria-label="Customer category filter"
                  value={customerCategory}
                  onChange={(event) => {
                    setCustomerCategory(event.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="">All categories</option>
                  <option>AGENT</option>
                  <option>LEISURE</option>
                  <option>CORPORATE</option>
                </Select>
              </Field>
              <Field
                label="Billed customer"
                error={apiFieldError(error, "customerId")}
              >
                <RecordSelect
                  name="customerId"
                  label="Billed customer"
                  required
                  value={customerId}
                  onChange={(value) => {
                    setCustomerId(value);
                    setDirty(true);
                  }}
                  placeholder="Select customer"
                  options={[
                    ...masterData(1),
                    ...(createdCustomer &&
                    !masterData(1).some(
                      (item) => item.id === createdCustomer.id,
                    )
                      ? [createdCustomer]
                      : []),
                  ]
                    .filter(
                      (item) =>
                        !customerCategory ||
                        item.category === customerCategory ||
                        item.id === customerId,
                    )
                    .map((item) => ({
                      id: item.id,
                      label: `${item.name} · ${item.category}`,
                    }))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setNewCustomer(true)}
                >
                  Create customer
                </Button>
              </Field>
              <Field
                label="Service category"
                error={apiFieldError(error, "serviceCategoryId")}
              >
                <RecordSelect
                  name="serviceCategoryId"
                  label="Service category"
                  required
                  value={serviceCategoryId}
                  onChange={(value) => {
                    setServiceCategoryId(value);
                    if (
                      !serviceCategories.find((item) => item.id === value)
                        ?.requiresVehicle
                    ) {
                      setVehicleId("");
                      setVehicleSearch("");
                    }
                    setDirty(true);
                  }}
                  placeholder="Select service"
                  options={serviceCategories.map((item) => ({
                    id: item.id,
                    label: `${item.name} · ${item.code}`,
                  }))}
                />
              </Field>
              {selectedServiceCategory?.requiresVehicle === true && (
                <Field
                  label="Vehicle"
                  hint="Search by registration number, display name, or vehicle type."
                  error={
                    vehicleSearch && !vehicleId
                      ? "Choose an active vehicle from the list."
                      : apiFieldError(error, "vehicleId")
                  }
                >
                  <Input
                    name="vehicleSearch"
                    aria-label="Vehicle"
                    list="active-invoice-vehicles"
                    value={vehicleSearch}
                    required
                    autoComplete="off"
                    placeholder="Search active vehicles…"
                    onChange={(event) => {
                      const nextSearch = event.target.value;
                      const match = activeVehicles.find(
                        (vehicle) => vehicleOptionLabel(vehicle) === nextSearch,
                      );
                      setVehicleSearch(nextSearch);
                      setVehicleId(match?.id ?? "");
                      setDirty(true);
                    }}
                  />
                  <datalist id="active-invoice-vehicles">
                    {activeVehicles.map((vehicle) => (
                      <option
                        key={vehicle.id}
                        value={vehicleOptionLabel(vehicle)}
                      />
                    ))}
                  </datalist>
                </Field>
              )}
              <Field
                label="Traveller / group display text"
                error={apiFieldError(error, "guestDisplayText")}
              >
                <Input
                  name="guestDisplayText"
                  required
                  maxLength={2000}
                  defaultValue={current?.guestDisplayText ?? ""}
                />
              </Field>
              <details className="optional-invoice-fields">
                <summary>Optional traveller and internal details</summary>
                <div className="form-grid">
                  {" "}
                  <Field
                    label="Linked guest (optional)"
                    error={apiFieldError(error, "guestId")}
                  >
                    <RecordSelect
                      name="guestId"
                      label="Linked guest (optional)"
                      value={guestId}
                      onChange={(value) => {
                        setGuestId(value);
                        setDirty(true);
                      }}
                      placeholder="No linked guest"
                      options={masterData(2).map((item) => ({
                        id: item.id,
                        label: String(item.name),
                      }))}
                    />
                  </Field>
                  <Field
                    label="Passenger count"
                    error={apiFieldError(error, "passengerCount")}
                  >
                    <Input
                      name="passengerCount"
                      type="number"
                      min={1}
                      max={100000}
                      defaultValue={current?.passengerCount ?? ""}
                    />
                  </Field>
                  <Field
                    label="Internal label"
                    error={apiFieldError(error, "label")}
                  >
                    <Input
                      name="label"
                      maxLength={4000}
                      defaultValue={current?.label ?? ""}
                    />
                  </Field>
                </div>
              </details>
            </div>
          </section>
          <section className="form-section">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h2>Dates & place of supply</h2>
                <p>Enter the invoice date, due date, and service location.</p>
              </div>
            </div>
            <div className="form-grid">
              <Field
                label="Invoice date"
                error={apiFieldError(error, "invoiceDate")}
              >
                <Input
                  name="invoiceDate"
                  type="date"
                  required
                  defaultValue={
                    current?.invoiceDate ??
                    new Date().toLocaleDateString("en-CA", {
                      timeZone: "Asia/Kolkata",
                    })
                  }
                />
              </Field>
              <Field label="Due date" error={apiFieldError(error, "dueDate")}>
                <Input
                  name="dueDate"
                  type="date"
                  defaultValue={current?.dueDate ?? ""}
                />
              </Field>
              <Field
                label="Service provided at"
                error={apiFieldError(error, "serviceProvidedAt")}
              >
                <Input
                  name="serviceProvidedAt"
                  required
                  defaultValue={current?.serviceProvidedAt ?? ""}
                />
              </Field>
              <Field
                label="Place of supply — state"
                error={apiFieldError(error, "placeOfSupplyState")}
              >
                <Input
                  name="placeOfSupplyState"
                  required
                  defaultValue={current?.placeOfSupplyState ?? ""}
                />
              </Field>
              <Field
                label="Place of supply — country"
                error={apiFieldError(error, "placeOfSupplyCountry")}
              >
                <Input
                  name="placeOfSupplyCountry"
                  required
                  defaultValue={current?.placeOfSupplyCountry ?? "INDIA"}
                />
              </Field>
              <RecordChecks
                key={companyId}
                label="Bank accounts"
                name="bankAccountIds"
                max={10}
                defaultValues={(current?.bankAccountIds ?? []).filter((value) =>
                  masterData(4).some(
                    (item) => item.id === value && item.companyId === companyId,
                  ),
                )}
                options={masterData(4)
                  .filter((item) => item.companyId === companyId)
                  .map((item) => ({
                    id: item.id,
                    label: `${item.name} · ${item.accountNumber}`,
                  }))}
              />
              {!companyId && (
                <p className="muted">
                  Select an issuing company to choose its bank accounts.
                </p>
              )}
            </div>
          </section>
          <section className="form-section">
            <div className="section-heading row">
              <span>03</span>
              <div>
                <h2>Service lines</h2>
                <p>
                  Enter amounts in rupees, with up to two decimal places. Taxes
                  are calculated when you save.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={lines.length >= 200}
                onClick={() => {
                  setLines([...lines, emptyLine()]);
                  setDirty(true);
                }}
              >
                <Plus size={16} /> Add line
              </Button>
            </div>
            <div className="line-list">
              {lines.map((line, index) => (
                <div className="invoice-line" key={line.clientId}>
                  <div className="line-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <Field label="Service description">
                    <Textarea
                      value={line.description}
                      required
                      maxLength={2000}
                      onChange={(e) =>
                        setLines(
                          lines.map((item) =>
                            item.clientId === line.clientId
                              ? { ...item, description: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Amount (INR)">
                    <Input
                      value={line.amount}
                      inputMode="decimal"
                      required
                      onChange={(e) =>
                        setLines(
                          lines.map((item) =>
                            item.clientId === line.clientId
                              ? { ...item, amount: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Tax treatment">
                    <Select
                      value={line.taxTreatment}
                      onChange={(e) =>
                        setLines(
                          lines.map((item) =>
                            item.clientId === line.clientId
                              ? {
                                  ...item,
                                  taxTreatment: e.target
                                    .value as Line["taxTreatment"],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="TAXABLE">Taxable</option>
                      <option value="NON_TAXABLE">Non-taxable</option>
                      <option value="EXEMPT">Exempt</option>
                      <option value="NIL_RATED">Nil-rated</option>
                    </Select>
                  </Field>
                  {line.taxTreatment === "TAXABLE" && (
                    <Field label="Tax components">
                      <Select
                        value={line.taxMode}
                        onChange={(e) =>
                          setLines(
                            lines.map((item) =>
                              item.clientId === line.clientId
                                ? {
                                    ...item,
                                    taxMode: e.target.value as Line["taxMode"],
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="IGST">IGST</option>
                        <option value="CGST_SGST">CGST + SGST</option>
                      </Select>
                    </Field>
                  )}
                  <div className="line-actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move line ${index + 1} up`}
                    >
                      <ArrowUp />
                    </button>
                    <button
                      type="button"
                      disabled={index === lines.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move line ${index + 1} down`}
                    >
                      <ArrowDown />
                    </button>
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines(
                          lines.filter(
                            (item) => item.clientId !== line.clientId,
                          ),
                        )
                      }
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {Boolean(error) && <ErrorState error={error} />}
          <footer className="sticky-actions">
            <span>{dirty ? "Unsaved changes" : "Ready to calculate"}</span>
            <Link
              className="button button-secondary"
              href={id ? recordHref("invoice-detail", id) : "/invoices"}
            >
              Cancel
            </Link>
            <Button disabled={save.isPending}>
              {save.isPending ? "Saving and calculating…" : "Save & calculate"}
            </Button>
          </footer>
        </fieldset>
      </form>
      {newCustomer && (
        <CustomerCreateDialog
          onClose={() => setNewCustomer(false)}
          onCreated={(customer) => {
            setCreatedCustomer(customer);
            setCustomerId(customer.id);
            setCustomerCategory("");
            setNewCustomer(false);
            setDirty(true);
          }}
        />
      )}
    </>
  );
}

export function vehicleOptionLabel(vehicle: Vehicle) {
  return `${vehicle.registrationNumber} — ${vehicle.displayName} (${vehicle.vehicleType})`;
}
