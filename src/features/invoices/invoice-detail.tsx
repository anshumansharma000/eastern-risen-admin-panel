"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  Check,
  FilePenLine,
  Printer,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, getResource, safeId } from "@/lib/api/client";
import type {
  CoreMaster,
  CoreRole,
  Invoice,
  InvoiceLine,
} from "@/lib/api/contracts";
import { can } from "@/lib/permissions";
import { formatINR, moneyToPaise, normalizeMoney } from "@/lib/money";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  StatusBadge,
  Textarea,
  SuccessNotice,
} from "@/components/ui";

export function InvoiceDetail({ id, role }: { id: string; role: CoreRole }) {
  const cache = useQueryClient();
  const [dialog, setDialog] = useState<
    | "issue"
    | "cancel"
    | "receipt"
    | "adjustment"
    | "reverseReceipt"
    | "reverseAdjustment"
    | null
  >(null);
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<unknown>();
  const detail = useQuery({
    queryKey: ["invoice", id],
    queryFn: ({ signal }) =>
      getResource<Invoice>(`/invoices/${safeId(id)}`, signal),
  });
  const current = detail.data?.data;
  const relatedResources = [
    ["company", "companies", current?.companyId],
    ["customer", "customers", current?.customerId],
    ["guest", "guests", current?.guestId],
    ["serviceCategory", "service-categories", current?.serviceCategoryId],
    ...(current?.bankAccountIds ?? []).map(
      (bankAccountId) =>
        ["bankAccount", "bank-accounts", bankAccountId] as const,
    ),
  ] as const;
  const related = useQueries({
    queries: relatedResources.map(([kind, resource, resourceId]) => ({
      queryKey: [resource, resourceId, "invoice-display"],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getResource<CoreMaster>(`/${resource}/${safeId(resourceId!)}`, signal),
      enabled: Boolean(resourceId),
      staleTime: 60_000,
      meta: { kind },
    })),
  });
  const action = useMutation({
    mutationFn: async ({
      path,
      body,
      key,
    }: {
      path: string;
      body?: unknown;
      key?: string;
    }) => api(path, { method: "POST", body, idempotencyKey: key }),
    onSuccess: async () => {
      setSuccess("Invoice updated. Balances are refreshing.");
      setDialog(null);
      setError(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["invoice", id] }),
        cache.invalidateQueries({ queryKey: ["invoices"] }),
        cache.invalidateQueries({ queryKey: ["receivables"] }),
      ]);
    },
    onError: setError,
  });
  if (detail.isLoading) return <Loading label="Loading invoice" />;
  if (detail.isError)
    return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const invoice = detail.data!.data;
  const receipts = invoice.receipts ?? [];
  const adjustments = invoice.settlementAdjustments ?? [];
  const relatedRecord = (kind: string) =>
    relatedResources
      .map(([resourceKind], index) => ({
        kind: resourceKind,
        record: related[index]?.data?.data,
      }))
      .find((item) => item.kind === kind)?.record;
  const bankAccounts = relatedResources.flatMap(([kind], index) =>
    kind === "bankAccount" && related[index]?.data?.data
      ? [related[index].data.data]
      : [],
  );
  const company =
    snapshotRecord(invoice.snapshot, "company") ?? relatedRecord("company");
  const customer =
    snapshotRecord(invoice.snapshot, "customer") ?? relatedRecord("customer");
  const serviceCategory =
    snapshotRecord(invoice.snapshot, "serviceCategory") ??
    relatedRecord("serviceCategory");
  const vehicle = snapshotRecord(invoice.snapshot, "vehicle");
  const snapshotBankAccounts = snapshotRecords(
    invoice.snapshot,
    "bankAccounts",
  );
  const printableBankAccounts = snapshotBankAccounts.length
    ? snapshotBankAccounts
    : bankAccounts;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (dialog === "issue")
      action.mutate({
        path: `/invoices/${safeId(id)}/issue`,
        body: { version: invoice.version },
      });
    if (dialog === "cancel")
      action.mutate({
        path: `/invoices/${safeId(id)}/cancel`,
        body: { reason: data.get("reason") },
      });
    if (dialog === "reverseReceipt")
      action.mutate({
        path: `/receipts/${safeId(selectedId)}/reverse`,
        body: { reason: data.get("reason") },
      });
    if (dialog === "reverseAdjustment")
      action.mutate({
        path: `/settlement-adjustments/${safeId(selectedId)}/reverse`,
        body: { reason: data.get("reason") },
      });
    if (dialog === "receipt") {
      const method = String(data.get("method"));
      const details =
        method === "CASH"
          ? {}
          : method === "CARD"
            ? {
                reference: data.get("reference"),
                cardLastFour: data.get("cardLastFour"),
              }
            : method === "CHEQUE" || method === "DD"
              ? {
                  reference: data.get("reference"),
                  bankName: data.get("bankName"),
                  instrumentDate: data.get("instrumentDate"),
                }
              : { reference: data.get("reference") };
      action.mutate({
        path: "/receipts",
        key: crypto.randomUUID(),
        body: {
          invoiceId: id,
          receivedDate: data.get("date"),
          amount: normalizeMoney(String(data.get("amount"))),
          method,
          details,
          status: data.get("status"),
        },
      });
    }
    if (dialog === "adjustment")
      action.mutate({
        path: "/settlement-adjustments",
        key: crypto.randomUUID(),
        body: {
          invoiceId: id,
          amount: normalizeMoney(String(data.get("amount"))),
          reason: data.get("reason"),
          date: data.get("date"),
        },
      });
  }
  return (
    <>
      <header className="page-header">
        <div>
          <Link href="/invoices" className="back-link">
            <ArrowLeft size={16} /> Invoices
          </Link>
          <p className="eyebrow">
            {invoice.status === "DRAFT"
              ? "Calculated draft"
              : "Preserved document"}
          </p>
          <h1>{invoice.invoiceNumber ?? "Draft invoice"}</h1>
          <p>
            {invoice.guestDisplayText} · {invoice.invoiceDate}
          </p>
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={17} /> Print / Save as PDF
          </Button>
          {invoice.status === "DRAFT" && can(role, "billing") && (
            <>
              <Link
                className="button button-secondary"
                href={`/invoices/${id}/edit`}
              >
                <FilePenLine size={17} /> Edit
              </Link>
              <Button
                disabled={related[3]?.isLoading}
                onClick={() => {
                  const requiresVehicle =
                    relatedRecord("serviceCategory")?.requiresVehicle === true;
                  if (requiresVehicle && !invoiceVehicleId(invoice)) {
                    setError(
                      new Error(
                        "Select an active vehicle on the draft before issuing this service category.",
                      ),
                    );
                    return;
                  }
                  setError(undefined);
                  setDialog("issue");
                }}
              >
                <ShieldCheck size={17} /> Issue invoice
              </Button>
            </>
          )}
          {invoice.status === "ISSUED" && can(role, "adminFinance") && (
            <Button variant="danger" onClick={() => setDialog("cancel")}>
              Cancel invoice
            </Button>
          )}
        </div>
      </header>
      <section className="invoice-summary">
        <div>
          <span>Grand total</span>
          <strong>{formatINR(invoice.grandTotal)}</strong>
          <small>Invoice value</small>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>{formatINR(invoice.receivedAmount ?? "0.00")}</strong>
          <small>Receipts</small>
        </div>
        <div>
          <span>Adjustments</span>
          <strong>{formatINR(invoice.adjustmentAmount ?? "0.00")}</strong>
          <small>Settlement discounts</small>
        </div>
        <div className="due">
          <span>Outstanding due</span>
          <strong>
            {formatINR(
              invoice.dueAmount ??
                (invoice.status === "ISSUED" ? invoice.grandTotal : "0.00"),
            )}
          </strong>
          <StatusBadge
            value={
              invoice.paymentStatus ??
              (invoice.status === "ISSUED" ? "UNPAID" : "NOT_APPLICABLE")
            }
          />
        </div>
      </section>
      <section className="invoice-paper">
        <header>
          <div>
            <p className="eyebrow">Eastern Risen · Core invoice</p>
            <h2>{invoice.invoiceNumber ?? "Unissued draft"}</h2>
          </div>
          <StatusBadge value={invoice.status} />
        </header>
        <div className="invoice-meta invoice-meta-detailed">
          <div>
            <span>Issuing company</span>
            <strong>
              {displayName(
                snapshotValue(invoice.snapshot, "company"),
                relatedRecord("company"),
              )}
            </strong>
          </div>
          <div>
            <span>Billed customer</span>
            <strong>
              {displayName(
                snapshotValue(invoice.snapshot, "customer"),
                relatedRecord("customer"),
              )}
            </strong>
          </div>
          <div>
            <span>Traveller / group</span>
            <strong>{displayValue(invoice.guestDisplayText)}</strong>
          </div>
          <div>
            <span>Linked guest</span>
            <strong>
              {invoice.guestId
                ? displayName(
                    snapshotValue(invoice.snapshot, "guest"),
                    relatedRecord("guest"),
                  )
                : "Not linked"}
            </strong>
          </div>
          <div>
            <span>Service category</span>
            <strong>
              {displayName(
                snapshotValue(invoice.snapshot, "serviceCategory"),
                relatedRecord("serviceCategory"),
              )}
            </strong>
          </div>
          <div>
            <span>Passenger count</span>
            <strong>{invoice.passengerCount ?? "Not provided"}</strong>
          </div>
          <div>
            <span>Invoice date</span>
            <strong>{displayValue(invoice.invoiceDate)}</strong>
          </div>
          <div>
            <span>Due date</span>
            <strong>{displayValue(invoice.dueDate)}</strong>
          </div>
          <div>
            <span>Service provided at</span>
            <strong>{displayValue(invoice.serviceProvidedAt)}</strong>
          </div>
          <div>
            <span>Place of supply</span>
            <strong>
              {displayValue(
                [invoice.placeOfSupplyState, invoice.placeOfSupplyCountry]
                  .filter(Boolean)
                  .join(", "),
              )}
            </strong>
          </div>
          <div>
            <span>Internal label</span>
            <strong>{displayValue(invoice.label)}</strong>
          </div>
          <div>
            <span>Bank accounts</span>
            <strong>
              {bankAccounts.length
                ? bankAccounts.map(masterDisplayName).join(" · ")
                : invoice.bankAccountIds?.length
                  ? "Account details unavailable from API"
                  : "None selected"}
            </strong>
          </div>
        </div>
        {vehicle && (
          <section className="invoice-vehicle" aria-label="Vehicle">
            <span>Vehicle</span>
            <div>
              <strong>
                {displayValue(recordText(vehicle, "registrationNumber"))} —{" "}
                {displayValue(recordText(vehicle, "name"))}
              </strong>
              <small>{displayValue(recordText(vehicle, "vehicleType"))}</small>
            </div>
          </section>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Tax treatment</th>
                <th>Base amount</th>
                <th>Tax breakdown</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines?.map((line) => (
                <tr key={line.position}>
                  <td>{line.position}</td>
                  <td>{line.description}</td>
                  <td>{line.taxTreatment.replaceAll("_", " ")}</td>
                  <td className="money">{formatINR(line.amount)}</td>
                  <td>
                    <LineTaxBreakdown line={line} />
                  </td>
                  <td className="money">
                    <strong>{formatINR(line.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totals">
          <div>
            <span>Subtotal</span>
            <strong>{formatINR(invoice.subtotal)}</strong>
          </div>
          <div>
            <span>Tax total</span>
            <strong>{formatINR(invoice.taxTotal)}</strong>
          </div>
          <div>
            <span>Grand total</span>
            <strong>{formatINR(invoice.grandTotal)}</strong>
          </div>
        </div>
      </section>
      <InvoicePrintCopy
        invoice={invoice}
        company={company}
        customer={customer}
        serviceCategory={serviceCategory}
        vehicle={vehicle}
        bankAccounts={printableBankAccounts}
      />
      {invoice.status === "ISSUED" && (
        <section className="settlement-grid">
          <div className="table-card">
            <header className="card-header">
              <div>
                <p className="eyebrow">Payment history</p>
                <h2>Receipts</h2>
              </div>
              {can(role, "receipts") && (
                <Button onClick={() => setDialog("receipt")}>
                  <Banknote size={17} /> Record receipt
                </Button>
              )}
            </header>
            {receipts.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td>{receipt.receiptNumber}</td>
                        <td>{receipt.receivedDate}</td>
                        <td>{receipt.method}</td>
                        <td className="money">{formatINR(receipt.amount)}</td>
                        <td>
                          <StatusBadge value={receipt.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            {receipt.status === "PENDING" &&
                              can(role, "receipts") && (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    action.mutate({
                                      path: `/receipts/${safeId(receipt.id)}/confirm`,
                                    })
                                  }
                                >
                                  <Check size={15} /> Confirm
                                </Button>
                              )}
                            {receipt.status !== "REVERSED" &&
                              can(role, "adminFinance") && (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedId(receipt.id);
                                    setDialog("reverseReceipt");
                                  }}
                                >
                                  <RotateCcw size={15} /> Reverse
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="card-empty">No receipts have been recorded.</p>
            )}
          </div>
          <div className="table-card">
            <header className="card-header">
              <div>
                <p className="eyebrow">Commercial adjustments</p>
                <h2>Settlement discounts</h2>
              </div>
              {can(role, "adminFinance") && (
                <Button onClick={() => setDialog("adjustment")}>
                  Record discount
                </Button>
              )}
            </header>
            {adjustments.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reason</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map((item) => (
                      <tr key={item.id}>
                        <td>{item.date}</td>
                        <td>{item.reason}</td>
                        <td className="money">{formatINR(item.amount)}</td>
                        <td>
                          <StatusBadge
                            value={item.reversedAt ? "REVERSED" : "ACTIVE"}
                          />
                        </td>
                        <td>
                          {!item.reversedAt && can(role, "adminFinance") && (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setSelectedId(item.id);
                                setDialog("reverseAdjustment");
                              }}
                            >
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="card-empty">
                No settlement discounts have been recorded.
              </p>
            )}
          </div>
        </section>
      )}
      {success && <SuccessNotice>{success}</SuccessNotice>}
      {error && <ErrorState error={error} />}
      {dialog && (
        <Modal
          closeDisabled={action.isPending}
          title={title(dialog)}
          subtitle={
            dialog === "issue"
              ? "This locks the reviewed document and allocates its number."
              : undefined
          }
          onClose={() => setDialog(null)}
        >
          <form className="record-form" onSubmit={submit}>
            {dialog === "issue" && (
              <div className="confirm-summary">
                <span>Grand total</span>
                <strong>{formatINR(invoice.grandTotal)}</strong>
                <p>
                  Confirm that the billed customer and server-calculated totals
                  are correct.
                </p>
              </div>
            )}
            {dialog === "receipt" && <ReceiptFields invoice={invoice} />}
            {dialog === "adjustment" && (
              <>
                <Field label="Date">
                  <Input
                    name="date"
                    type="date"
                    required
                    min={invoice.invoiceDate}
                    defaultValue={invoice.invoiceDate}
                  />
                </Field>
                <Field label="Amount (INR)">
                  <Input name="amount" inputMode="decimal" required />
                </Field>
                <Field label="Reason">
                  <Textarea name="reason" required maxLength={2000} />
                </Field>
                <div className="notice">
                  <span>
                    This changes the outstanding balance without rewriting
                    invoice tax or cash received.
                  </span>
                </div>
              </>
            )}
            {["cancel", "reverseReceipt", "reverseAdjustment"].includes(
              dialog,
            ) && (
              <Field label="Reason">
                <Textarea name="reason" required maxLength={2000} />
              </Field>
            )}
            {Boolean(error) && <ErrorState error={error} />}
            <footer>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialog(null)}
              >
                Keep unchanged
              </Button>
              <Button
                variant={
                  dialog === "cancel" || dialog.startsWith("reverse")
                    ? "danger"
                    : "primary"
                }
                disabled={action.isPending}
              >
                {action.isPending ? "Working…" : confirmLabel(dialog)}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function ReceiptFields({ invoice }: { invoice: Invoice }) {
  const [method, setMethod] = useState("UPI");
  const [receiptStatus, setReceiptStatus] = useState("CONFIRMED");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  return (
    <>
      <p className="receipt-balance">
        Outstanding balance: <strong>{formatINR(invoice.dueAmount)}</strong>
      </p>
      <Field label="Received date">
        <Input
          name="date"
          type="date"
          required
          min={invoice.invoiceDate}
          defaultValue={
            today < invoice.invoiceDate ? invoice.invoiceDate : today
          }
        />
      </Field>
      <Field label="Amount (INR)">
        <Input name="amount" inputMode="decimal" required />
      </Field>
      <Field label="Method">
        <Select
          name="method"
          value={method}
          onChange={(e) => {
            const value = e.target.value;
            setMethod(value);
            setReceiptStatus(
              value === "CHEQUE" || value === "DD" ? "PENDING" : "CONFIRMED",
            );
          }}
        >
          <option>UPI</option>
          <option>CASH</option>
          <option>CARD</option>
          <option>CHEQUE</option>
          <option>DD</option>
        </Select>
      </Field>
      <Field label="Initial status">
        <Select
          name="status"
          value={receiptStatus}
          onChange={(event) => setReceiptStatus(event.target.value)}
        >
          <option>CONFIRMED</option>
          <option>PENDING</option>
        </Select>
      </Field>
      {method !== "CASH" && (
        <Field label="Reference">
          <Input name="reference" required maxLength={200} />
        </Field>
      )}
      {(method === "CHEQUE" || method === "DD") && (
        <>
          <Field label="Bank name">
            <Input name="bankName" required />
          </Field>
          <Field label="Instrument date">
            <Input name="instrumentDate" type="date" required />
          </Field>
        </>
      )}
      {method === "CARD" && (
        <Field label="Card last four digits">
          <Input
            name="cardLastFour"
            required
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
          />
        </Field>
      )}
      <small>
        Payment references record a payment; they do not verify a bank
        transaction.
      </small>
    </>
  );
}
function title(dialog: string) {
  return (
    {
      issue: "Issue invoice",
      cancel: "Cancel invoice",
      receipt: "Record receipt",
      adjustment: "Record settlement discount",
      reverseReceipt: "Reverse receipt",
      reverseAdjustment: "Reverse settlement discount",
    } as Record<string, string>
  )[dialog];
}
function confirmLabel(dialog: string) {
  return (
    {
      issue: "Issue invoice",
      cancel: "Cancel invoice",
      receipt: "Record receipt",
      adjustment: "Record discount",
      reverseReceipt: "Reverse receipt",
      reverseAdjustment: "Reverse discount",
    } as Record<string, string>
  )[dialog];
}
function snapshotValue(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return value ?? null;
}

function snapshotRecord(snapshot: unknown, key: string) {
  const value = snapshotValue(snapshot, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function snapshotRecords(snapshot: unknown, key: string) {
  const value = snapshotValue(snapshot, key);
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function displayName(snapshot: unknown, current?: CoreMaster) {
  if (typeof snapshot === "string" && snapshot.trim()) return snapshot;
  if (snapshot && typeof snapshot === "object") {
    const name = masterDisplayName(snapshot as Record<string, unknown>);
    if (name !== "Details unavailable") return name;
  }
  return current ? masterDisplayName(current) : "Details unavailable";
}

function masterDisplayName(record: Record<string, unknown>) {
  for (const key of ["name", "displayName", "legalName", "accountName"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Details unavailable";
}

function displayValue(value: unknown): string | number {
  if (typeof value === "string") return value.trim() || "Not provided";
  if (typeof value === "number") return value;
  return "Not provided";
}

function invoiceVehicleId(invoice: Invoice) {
  return invoice.details?.vehicleId ?? invoice.vehicleId ?? null;
}

function LineTaxBreakdown({ line }: { line: InvoiceLine }) {
  if (line.appliedTaxes?.length)
    return (
      <div className="line-tax-breakdown">
        {line.appliedTaxes.map((tax, index) => (
          <div key={`${tax.component}-${tax.rate}-${index}`}>
            <span>
              <strong>{tax.component}</strong> at {tax.rate}%
            </span>
            <span className="money">{formatINR(tax.amount)}</span>
          </div>
        ))}
        {line.appliedTaxes.length > 1 && (
          <div className="line-tax-total">
            <span>Total tax</span>
            <strong className="money">{formatINR(line.taxAmount)}</strong>
          </div>
        )}
      </div>
    );

  if (Number(line.taxAmount) > 0)
    return (
      <div className="line-tax-breakdown">
        <strong className="money">{formatINR(line.taxAmount)}</strong>
        <small className="tax-breakdown-warning">
          Type and rate unavailable from API
        </small>
      </div>
    );

  return <span className="muted">No tax</span>;
}

function InvoicePrintCopy({
  invoice,
  company,
  customer,
  serviceCategory,
  vehicle,
  bankAccounts,
}: {
  invoice: Invoice;
  company?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  serviceCategory?: Record<string, unknown>;
  vehicle?: Record<string, unknown>;
  bankAccounts: Record<string, unknown>[];
}) {
  const taxRows = aggregateAppliedTaxes(invoice.lines ?? []);
  const taxableLines = (invoice.lines ?? []).filter(
    (line) => line.taxTreatment === "TAXABLE",
  );
  const nonTaxableLines = (invoice.lines ?? []).filter(
    (line) => line.taxTreatment !== "TAXABLE",
  );
  const companyName = company ? masterDisplayName(company) : "Eastern Risen";
  const customerName = customer
    ? masterDisplayName(customer)
    : "Customer details unavailable";
  const serviceName = serviceCategory
    ? masterDisplayName(serviceCategory)
    : "Service";
  const serviceCode = recordText(serviceCategory, "code");
  const companyAddress = joinRecordValues(company, [
    "address",
    "city",
    "state",
    "postalCode",
    "country",
  ]);
  const customerAddress = joinRecordValues(customer, [
    "address",
    "city",
    "state",
    "postalCode",
    "country",
  ]);

  return (
    <section className="print-invoice" aria-label="Printable invoice">
      <header className="print-letterhead">
        <Image
          className="print-logo"
          src="/invoice/eastern-risen-logo.png"
          alt="Eastern Risen"
          width={922}
          height={271}
          loading="eager"
          unoptimized
        />
        <h1>{companyName}</h1>
        {companyAddress && <p>{companyAddress}</p>}
        <p>{joinRecordValues(company, ["phone", "mobileNumber", "email"])}</p>
        <p>
          {joinLabelledValues([
            ["PAN", recordText(company, "pan")],
            ["Service Tax No", recordText(company, "serviceTaxNumber")],
            ["CIN", recordText(company, "cin")],
            ["GSTIN", recordText(company, "gstNumber")],
          ])}
        </p>
      </header>

      <h2 className="print-title">
        {invoice.status === "DRAFT" ? "Draft Tax Invoice" : "Tax Invoice"}
      </h2>

      <section className="print-invoice-details">
        <strong>
          {serviceName}
          {serviceCode ? ` (HSN/SAC CODE: ${serviceCode})` : ""}
        </strong>
        <p>
          <b>Invoice No:</b> {invoice.invoiceNumber ?? "Unissued draft"}
          <span className="print-divider">/</span>
          <b>Date:</b> {invoice.invoiceDate}
        </p>
        <p>
          <b>Service provided at:</b> {displayValue(invoice.serviceProvidedAt)}
        </p>
        {vehicle && (
          <p>
            <b>Vehicle:</b>{" "}
            {displayValue(recordText(vehicle, "registrationNumber"))}
            {" — "}
            {displayValue(recordText(vehicle, "name"))} (
            {displayValue(recordText(vehicle, "vehicleType"))})
          </p>
        )}
        <p>
          <b>Guest:</b> {displayValue(invoice.guestDisplayText)}
          {invoice.passengerCount ? ` x ${invoice.passengerCount}` : ""}
        </p>
        <p>
          <b>Customer:</b> {customerName}
          {customerAddress ? `, ${customerAddress}` : ""}
          {recordText(customer, "gstNumber")
            ? `, GSTIN: ${recordText(customer, "gstNumber")}`
            : ""}
        </p>
        <p>
          <b>Place of supply:</b>{" "}
          {displayValue(
            [invoice.placeOfSupplyState, invoice.placeOfSupplyCountry]
              .filter(Boolean)
              .join(", "),
          )}
        </p>
      </section>

      {nonTaxableLines.length > 0 && (
        <PrintLineGroup
          title="Non Taxable Item"
          lines={nonTaxableLines}
          totalLabel="Total Non Taxable Amount"
        />
      )}
      {taxableLines.length > 0 && (
        <PrintLineGroup
          title="Taxable Item"
          lines={taxableLines}
          totalLabel="Total Amount Before Tax"
        />
      )}

      <section className="print-calculation">
        <p className="print-tax-heading">
          <strong>Tax calculation</strong>
          <small>Totals of the item-level tax shown above</small>
        </p>
        {taxRows.length ? (
          taxRows.map((tax) => (
            <div key={`${tax.component}-${tax.rate}`}>
              <span>
                {tax.component} @ {tax.rate}%
              </span>
              <span>{formatINR(tax.amount)}</span>
            </div>
          ))
        ) : Number(invoice.taxTotal) > 0 ? (
          <div>
            <span>Tax</span>
            <span>{formatINR(invoice.taxTotal)}</span>
          </div>
        ) : null}
        <div>
          <strong>Total Tax</strong>
          <strong>{formatINR(invoice.taxTotal)}</strong>
        </div>
        <div className="print-grand-total">
          <strong>Grand Total</strong>
          <strong>{formatINR(invoice.grandTotal)}</strong>
        </div>
      </section>

      <p className="print-amount-words">{amountInWords(invoice.grandTotal)}</p>

      <section className="print-footer-notes">
        <p>
          {recordText(company, "paymentInstructions") ||
            "Payment should be made to one of the bank accounts listed below."}
        </p>
        <p>
          <strong>Note:</strong>{" "}
          {recordText(company, "footerNotes") ||
            "This is a computer-generated invoice."}
        </p>
      </section>

      <section className="print-signature">
        <div />
        <div>
          <Image
            src="/invoice/er-signature.png"
            alt="Authorised signature"
            width={51}
            height={24}
            loading="eager"
            unoptimized
          />
          {/* <span>For</span> */}
          <strong>{companyName}</strong>
          <span>Authorised Signatory</span>
        </div>
      </section>

      {bankAccounts.length > 0 && (
        <section className="print-bank-details">
          <strong>Bank Details:</strong>
          {bankAccounts.map((account, index) => (
            <p key={String(account.id ?? index)}>
              {joinLabelledValues([
                ["Bank", recordText(account, "name")],
                ["Branch", recordText(account, "branch")],
                ["Account No", recordText(account, "accountNumber")],
                ["IFSC", recordText(account, "ifscCode")],
                ["SWIFT", recordText(account, "swiftCode")],
              ])}
            </p>
          ))}
        </section>
      )}
      <footer className="print-accreditations">
        <Image
          src="/invoice/footer-logos.jpg"
          alt="Eastern Risen accreditations and memberships"
          width={500}
          height={48}
          loading="eager"
          unoptimized
        />
      </footer>
    </section>
  );
}

function PrintLineGroup({
  title,
  lines,
  totalLabel,
}: {
  title: string;
  lines: InvoiceLine[];
  totalLabel: string;
}) {
  const isTaxableGroup = lines.every((line) => line.taxTreatment === "TAXABLE");
  return (
    <section className="print-services">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Sl. no.</th>
            <th>Service details</th>
            <th>{isTaxableGroup ? "Base amount" : "Amount"}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.position}>
              <td>{index + 1}</td>
              <td>
                {line.description}
                {line.taxTreatment === "TAXABLE" && (
                  <PrintLineTaxBreakdown line={line} />
                )}
                {line.taxTreatment !== "TAXABLE" &&
                  line.taxTreatment !== "NON_TAXABLE" && (
                    <small>{line.taxTreatment.replaceAll("_", " ")}</small>
                  )}
              </td>
              <td>{formatINR(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>{totalLabel}</td>
            <td>{formatINR(sumLineAmounts(lines))}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function PrintLineTaxBreakdown({ line }: { line: InvoiceLine }) {
  if (line.appliedTaxes?.length)
    return (
      <small className="print-line-tax">
        <b>Tax applied:</b>{" "}
        {line.appliedTaxes
          .map(
            (tax) =>
              `${tax.component} @ ${tax.rate}% = ${formatINR(tax.amount)}`,
          )
          .join(" | ")}
      </small>
    );

  return (
    <small className="print-line-tax print-line-tax-missing">
      <b>Tax applied:</b> Rate breakdown unavailable (
      {formatINR(line.taxAmount)})
    </small>
  );
}

function recordText(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function joinRecordValues(
  record: Record<string, unknown> | undefined,
  keys: string[],
) {
  return keys
    .map((key) => recordText(record, key))
    .filter(Boolean)
    .join(", ");
}

function joinLabelledValues(values: Array<[string, string]>) {
  return values
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)
    .join(" | ");
}

function aggregateAppliedTaxes(lines: InvoiceLine[]) {
  const taxes = new Map<
    string,
    { component: string; rate: string; amount: bigint }
  >();
  lines.forEach((line) =>
    line.appliedTaxes?.forEach((tax) => {
      const key = `${tax.component}:${tax.rate}`;
      const existing = taxes.get(key);
      taxes.set(key, {
        component: tax.component,
        rate: tax.rate,
        amount: (existing?.amount ?? BigInt(0)) + moneyToPaise(tax.amount),
      });
    }),
  );
  return Array.from(taxes.values()).map((tax) => ({
    ...tax,
    amount: `${tax.amount / BigInt(100)}.${String(tax.amount % BigInt(100)).padStart(2, "0")}`,
  }));
}

function sumLineAmounts(lines: InvoiceLine[]) {
  const paise = lines.reduce(
    (total, line) => total + moneyToPaise(line.amount),
    BigInt(0),
  );
  return `${paise / BigInt(100)}.${String(paise % BigInt(100)).padStart(2, "0")}`;
}

function amountInWords(value: string) {
  const [whole = "0", fraction = "0"] = value.split(".");
  const rupees = BigInt(whole);
  const paise = Number(fraction.padEnd(2, "0").slice(0, 2));
  const rupeeWords = indianNumberWords(rupees);
  const paiseWords = paise ? ` and ${underThousandWords(paise)} Paise` : "";
  return `Rupees ${rupeeWords}${paiseWords} Only.`;
}

function indianNumberWords(value: bigint): string {
  if (value === BigInt(0)) return "Zero";
  const parts: string[] = [];
  const units: Array<[bigint, string]> = [
    [BigInt(10_000_000), "Crore"],
    [BigInt(100_000), "Lakh"],
    [BigInt(1_000), "Thousand"],
  ];
  let remaining = value;
  units.forEach(([size, label]) => {
    if (remaining >= size) {
      const count = remaining / size;
      parts.push(`${indianNumberWords(count)} ${label}`);
      remaining %= size;
    }
  });
  if (remaining > BigInt(0)) parts.push(underThousandWords(Number(remaining)));
  return parts.join(" ");
}

function underThousandWords(value: number): string {
  const ones = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const words: string[] = [];
  let remaining = value;
  if (remaining >= 100) {
    words.push(`${ones[Math.floor(remaining / 100)]} Hundred`);
    remaining %= 100;
  }
  if (remaining >= 20) {
    words.push(tens[Math.floor(remaining / 10)]);
    if (remaining % 10) words.push(ones[remaining % 10]);
  } else if (remaining > 0) {
    words.push(ones[remaining]);
  }
  return words.join(" ");
}
