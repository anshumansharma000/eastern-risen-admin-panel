"use client";

import { recordHref } from "@/lib/routes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoreRole } from "@/lib/api/contracts";
import { formatINR, moneyToPaise, normalizeMoney } from "@/lib/money";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  StatusBadge,
} from "@/components/ui";
import {
  commercialApi,
  type AvailableInvoice,
  type InvoiceLinkIdentifier,
  type Milestone,
} from "./api";
import {
  indiaToday,
  latestAccepted,
  scheduleError,
  statusReason,
} from "./rules";
import { CustomerLink } from "./customer-link";
import { QuoteComposer } from "./quote-composer";
import { QuoteBreakdown } from "./quote-breakdown";
import { BillingReviewPanel } from "./billing-review";

const stages = ["DRAFT", "QUOTED", "INVOICED", "CONFIRMED", "COMPLETED"];
const invoicePageSize = 25;
function canLinkInvoice(
  invoice: AvailableInvoice,
): invoice is AvailableInvoice & InvoiceLinkIdentifier {
  return (
    invoice.eligible && Boolean(invoice.invoiceNumber && invoice.financialYear)
  );
}
function dateTime(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "—";
}
function invoiceDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}

function InvoicePicker({
  id,
  onLinked,
  onError,
}: {
  id: string;
  onLinked: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AvailableInvoice | null>(null);
  const cache = useQueryClient();
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const available = useQuery({
    queryKey: ["commercial-available-invoices", id, q, page],
    queryFn: ({ signal }) =>
      commercialApi.availableInvoices(id, q, page, invoicePageSize, signal),
    enabled: q.length > 0,
  });
  const link = useMutation({
    mutationFn: (invoice: InvoiceLinkIdentifier) =>
      commercialApi.linkInvoice(id, invoice),
    onSuccess: async () => {
      onError(null);
      setSelected(null);
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["commercial-available-invoices", id],
        }),
        onLinked(),
      ]);
    },
    onError: async (error) => {
      onError(error);
      setSelected(null);
      await Promise.all([available.refetch(), onLinked()]);
    },
  });
  const waitingForSearch = search.trim() !== q;
  return (
    <div className="commercial-invoice-picker">
      <Field
        label="Find an issued invoice"
        hint="Search by invoice number, customer, guest, label, or line description."
      >
        <Input
          aria-label="Search invoices"
          placeholder="Invoice, customer, guest, or tour details"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
            setSelected(null);
            onError(null);
          }}
        />
      </Field>
      {!search.trim() ? (
        <p role="status">Enter a search to find invoices.</p>
      ) : waitingForSearch || available.isPending || available.isFetching ? (
        <Loading label="Finding available invoices" />
      ) : available.isError ? (
        <ErrorState
          error={available.error}
          onRetry={() => available.refetch()}
        />
      ) : available.data.data.length === 0 ? (
        <p role="status">No invoices match this search.</p>
      ) : (
        <div
          className="commercial-invoice-results"
          aria-label="Available invoices"
        >
          {available.data.data.map((item) => (
            <button
              key={item.id}
              type="button"
              className="commercial-invoice-result"
              aria-pressed={selected?.id === item.id}
              disabled={!canLinkInvoice(item)}
              onClick={() => {
                setSelected(item);
                onError(null);
              }}
            >
              <strong>{item.invoiceNumber ?? "Draft invoice"}</strong>
              <span>
                Customer: {item.customerName} · Guest: {item.guestName}
              </span>
              <span>
                {invoiceDate(item.invoiceDate)} · {formatINR(item.grandTotal)}
              </span>
              <span>Status: {item.status.replaceAll("_", " ")}</span>
              {item.label && <span>Label: {item.label}</span>}
              {item.lineDescription && (
                <span>Line: {item.lineDescription}</span>
              )}
              {!canLinkInvoice(item) && (
                <span className="commercial-invoice-reasons">
                  Unavailable:{" "}
                  {item.unavailableReasons.length
                    ? item.unavailableReasons.join("; ")
                    : !item.invoiceNumber || !item.financialYear
                      ? "Invoice number and financial year are required."
                      : "This invoice cannot be linked."}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {!waitingForSearch &&
        !available.isError &&
        available.data &&
        available.data.pagination.total > invoicePageSize && (
          <Pagination
            {...available.data.pagination}
            onPage={(nextPage) => {
              setSelected(null);
              setPage(nextPage);
              onError(null);
            }}
          />
        )}
      <Button
        type="button"
        disabled={
          !selected ||
          !canLinkInvoice(selected) ||
          waitingForSearch ||
          available.isFetching ||
          link.isPending
        }
        onClick={() => {
          if (selected && canLinkInvoice(selected))
            link.mutate({
              invoiceNumber: selected.invoiceNumber,
              financialYear: selected.financialYear,
            });
        }}
      >
        {link.isPending ? "Linking…" : "Link issued invoice"}
      </Button>
    </div>
  );
}
export function BookingDetailPage({
  id,
  role,
}: {
  id: string;
  role: CoreRole;
}) {
  const cache = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [showBillingReview, setShowBillingReview] = useState(false);
  const [manualBilling, setManualBilling] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["commercial-booking", id],
    queryFn: ({ signal }) => commercialApi.detail(id, signal),
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["commercial-booking", id] }),
      cache.invalidateQueries({ queryKey: ["invoice"] }),
    ]);
  };
  const rotate = useMutation({
    mutationFn: () => commercialApi.rotate(id),
    onSuccess: (r) => {
      setLink(r.data.accessToken);
      setError(null);
    },
    onError: setError,
  });
  const schedule = useMutation({
    mutationFn: (body: Parameters<typeof commercialApi.schedule>[1]) =>
      commercialApi.schedule(id, body),
    onSuccess: refresh,
    onError: setError,
  });
  const status = useMutation({
    mutationFn: (s: "CONFIRMED" | "CANCELLED" | "COMPLETED") =>
      commercialApi.status(id, s),
    onSuccess: refresh,
    onError: setError,
  });
  const reconcile = useMutation({
    mutationFn: commercialApi.reconcile,
    onSuccess: refresh,
    onError: setError,
  });
  const [scheduleMode, setScheduleMode] = useState<"default" | "custom">(
    "default",
  );
  const [reviewSchedule, setReviewSchedule] = useState(false);
  const [milestones, setMilestones] = useState<
    Array<Pick<Milestone, "label" | "amount" | "dueOn">>
  >([{ label: "Advance", amount: "", dueOn: indiaToday() }]);
  const editable = role !== "CORE_REPORT_VIEWER";
  if (query.isLoading) return <Loading label="Loading commercial booking" />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data!.data;
  const b = d.booking;
  const latest = [...d.quotes].sort((a, c) => c.version - a.version)[0];
  const accepted = Boolean(latestAccepted(d));
  const canQuote =
    editable &&
    !d.invoice &&
    !b.invoiceId &&
    b.status !== "CANCELLED" &&
    b.status !== "COMPLETED";
  const total = d.invoice?.grandTotal ?? "0.00";
  const sum = milestones.reduce((n, m) => {
    try {
      return n + moneyToPaise(m.amount);
    } catch {
      return n;
    }
  }, 0n);
  const customError = d.invoice
    ? scheduleError(milestones, total, indiaToday())
    : null;
  const structured = Boolean(
    latest?.pricing && latest?.proposedPlan && !latest?.legacy,
  );
  const closed = b.status === "CANCELLED" || b.status === "COMPLETED";
  const newBilling =
    structured && !d.invoice && !b.invoiceId && !d.milestones.length;
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Commercial booking · {b.reference}</p>
          <h1>{b.title}</h1>
          <p>
            Follow the quote, invoice and payment milestones for this booking.
          </p>
        </div>
        <Link className="button button-secondary" href="/commercial-bookings">
          All bookings
        </Link>
      </header>
      <div className="commercial-stages" aria-label="Booking stages">
        {stages.map((s, i) => (
          <span
            key={s}
            className={stages.indexOf(b.status) >= i ? "current" : ""}
          >
            {s}
          </span>
        ))}
        {b.status === "CANCELLED" && <StatusBadge value="CANCELLED" />}
      </div>
      <section className="next-action-card" aria-label="Next booking action">
        <p className="eyebrow">Next step</p>
        <h2>
          {closed
            ? "This booking is closed"
            : !latest
              ? "Prepare the customer quote"
              : !accepted
                ? "Awaiting customer acceptance"
                : !d.invoice
                  ? "Prepare billing and enable payment"
                  : !d.milestones.length
                    ? "Set up the payment schedule"
                    : b.status === "CONFIRMED"
                      ? "Track the remaining payments and service"
                      : "Review the initial payment before confirmation"}
        </h2>
        {!closed && (
          <a
            className="button button-secondary"
            href={
              !latest || !accepted
                ? "#booking-quotes"
                : !d.invoice
                  ? "#billing-setup"
                  : "#payment-schedule"
            }
          >
            Go to{" "}
            {!latest || !accepted
              ? "quotes"
              : !d.invoice
                ? "billing"
                : "payment schedule"}
          </a>
        )}
      </section>
      <details
        className="commercial-card customer-link-details"
        open={link ? true : undefined}
      >
        <summary>Private customer link</summary>
        <div className="commercial-heading">
          <h2>Customer access</h2>
          <StatusBadge value={b.status} />
        </div>
        <p>
          The access token is shown only when created or rotated. Rotation
          invalidates the previous customer URL.
        </p>
        {link && <CustomerLink token={link} />}
        {editable && (
          <Button
            type="button"
            variant="secondary"
            disabled={rotate.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Rotate the private link? The old customer URL will stop working.",
                )
              ) {
                setLink(null);
                rotate.mutate();
              }
            }}
          >
            {rotate.isPending ? "Rotating…" : "Rotate private link"}
          </Button>
        )}
      </details>
      <section className="commercial-card" id="booking-quotes">
        <h2>Quotes</h2>
        <p>
          The latest accepted quote sets the customer-facing gross total. An
          earlier version’s acceptance does not apply to a revision.
        </p>
        {d.quotes.length ? (
          d.quotes.map((q) => (
            <details
              className="quote-version"
              key={q.id}
              open={q.id === latest?.id}
            >
              <summary>
                Version {q.version} · {formatINR(q.total)}
                {q.id === latest?.id ? " · Latest quote" : " · Previous quote"}
              </summary>
              <article className="commercial-row commercial-quote">
                <div>
                  <strong>
                    Version {q.version} · {formatINR(q.total)}
                  </strong>
                  <p>{q.description}</p>
                  <small>
                    Expires {q.expiresOn ?? "—"} · Acceptance:{" "}
                    {q.id === latest?.id
                      ? dateTime(q.acceptedAt)
                      : `Superseded${q.acceptedAt ? ` · Accepted ${dateTime(q.acceptedAt)}` : " · Never accepted"}`}
                  </small>
                  <details>
                    <summary>Inclusions, exclusions and terms</summary>
                    <p>Inclusions: {q.inclusions || "—"}</p>
                    <p>Exclusions: {q.exclusions || "—"}</p>
                    <p>Terms: {q.terms}</p>
                  </details>
                </div>
                <QuoteBreakdown pricing={q.pricing} plan={q.proposedPlan} />
                {q.id === latest?.id && (
                  <StatusBadge
                    value={q.acceptedAt ? "ACCEPTED" : "AWAITING_ACCEPTANCE"}
                  />
                )}
              </article>
            </details>
          ))
        ) : (
          <Empty
            title="No quote yet"
            detail="Create the first quote for the customer."
          />
        )}
        {canQuote && (
          <QuoteComposer
            booking={b}
            latest={latest}
            onSaved={async (saved) => {
              cache.setQueryData<{ data: typeof d }>(
                ["commercial-booking", id],
                (old) =>
                  old
                    ? {
                        ...old,
                        data: {
                          ...old.data,
                          quotes: [
                            saved,
                            ...old.data.quotes.filter((q) => q.id !== saved.id),
                          ],
                        },
                      }
                    : old,
              );
              await refresh();
            }}
          />
        )}
      </section>
      <section className="commercial-card" id="billing-setup">
        <h2>Invoice and payment setup</h2>
        {newBilling && !accepted && (
          <p>
            Wait for acceptance of the latest quote before reviewing billing and
            enabling payment.
          </p>
        )}
        {newBilling && accepted && !editable && (
          <p>The latest quote is accepted. Staff billing review is pending.</p>
        )}
        {newBilling && accepted && editable && !closed && (
          <>
            <p>
              The latest quote is accepted. Review the invoice-only details,
              then issue and link the invoice and activate the agreed payment
              schedule together.
            </p>
            <Button onClick={() => setShowBillingReview(true)}>
              Review and enable payment
            </Button>
            <Button variant="ghost" onClick={() => setManualBilling((v) => !v)}>
              {manualBilling
                ? "Hide manual billing"
                : "Use manual billing instead"}
            </Button>
            {manualBilling && (
              <p>
                Manual billing must match the accepted service lines, taxes and
                payment dates. It cannot be resumed through the combined
                enablement action after linking an invoice.
              </p>
            )}
          </>
        )}
        {showBillingReview && newBilling && accepted && editable && !closed && (
          <BillingReviewPanel
            key={`${b.id}-${latest.id}-${latest.acceptedAt}-${b.status}-${b.invoiceId}-${d.milestones.length}`}
            booking={b}
            quote={latest}
            onClose={() => setShowBillingReview(false)}
            onRefresh={refresh}
            onEnabled={async (result) => {
              cache.setQueryData(["commercial-booking", id], result);
              setShowBillingReview(false);
              await Promise.all([
                refresh(),
                cache.invalidateQueries({ queryKey: ["invoices"] }),
                cache.invalidateQueries({ queryKey: ["commercial-bookings"] }),
              ]);
            }}
          />
        )}
        {(!newBilling || manualBilling) && (
          <>
            {!structured && (
              <p className="muted">
                Legacy quote: continue manual invoice linking and schedule
                creation, or prepare a structured revision before invoicing.
              </p>
            )}
            {!accepted ? (
              <p>
                Wait for acceptance of the latest quote before issuing and
                linking an invoice.
              </p>
            ) : (
              <>
                <p>
                  Accepted gross quote:{" "}
                  <strong>{formatINR(latest.total)}</strong>. Create and issue
                  the full invoice in the invoice area. Its company, customer,
                  service category and grand total must match this quote.
                </p>
                {editable && !closed && !d.invoice && !b.invoiceId && (
                  <Link
                    className="button button-secondary"
                    href={`/invoices/new?companyId=${encodeURIComponent(b.companyId)}&customerId=${encodeURIComponent(b.customerId)}&serviceCategoryId=${encodeURIComponent(b.serviceCategoryId)}`}
                  >
                    Create invoice
                  </Link>
                )}
              </>
            )}
            {d.invoice ? (
              <div className="commercial-row">
                <div>
                  <Link
                    className="text-link"
                    href={recordHref("invoice-detail", d.invoice.id)}
                  >
                    <strong>
                      {d.invoice.invoiceNumber ?? "Draft invoice"}
                    </strong>
                  </Link>
                  <p>
                    Grand total {formatINR(d.invoice.grandTotal)} · received{" "}
                    {formatINR(d.invoice.receivedAmount)} · due{" "}
                    {formatINR(d.invoice.dueAmount)} · {d.invoice.paymentStatus}
                  </p>
                </div>
              </div>
            ) : (
              accepted &&
              editable &&
              !closed &&
              !b.invoiceId && (
                <InvoicePicker id={id} onLinked={refresh} onError={setError} />
              )
            )}
          </>
        )}
      </section>
      <section className="commercial-card" id="payment-schedule">
        <h2>Payment schedule</h2>
        {d.milestones.length ? (
          <>
            <p>Schedule created. Milestones are immutable.</p>
            {d.milestones.map((m, i) => (
              <div className="commercial-row" key={m.id}>
                <div>
                  <strong>
                    {i + 1}. {m.label} · {formatINR(m.amount)}
                  </strong>
                  <p>
                    Due {m.dueOn} · remaining {formatINR(m.remainingAmount)}
                  </p>
                </div>
                <StatusBadge
                  value={
                    m.status ??
                    (m.remainingAmount === "0.00" ? "PAID" : "PENDING")
                  }
                />
              </div>
            ))}
          </>
        ) : !d.invoice ? (
          <p>
            {newBilling
              ? "The proposed payment plan becomes active after acceptance and staff payment enablement."
              : "Link an issued invoice before creating a schedule or collecting payment."}
          </p>
        ) : structured && latest.proposedPlan ? (
          <>
            <QuoteBreakdown
              pricing={latest.pricing}
              plan={latest.proposedPlan}
            />
            <p>
              This manually linked invoice must use the exact accepted schedule.
              Payment dates cannot be changed.
            </p>
            {latest.proposedPlan.milestones.some(
              (m) => m.dueOn < indiaToday(),
            ) ? (
              <p role="alert">
                The agreed schedule has past due dates. The manual schedule
                endpoint cannot create these dates. Staff resolution is
                required; do not move agreed dates or recreate the invoice.
              </p>
            ) : (
              editable &&
              !closed && (
                <Button
                  disabled={schedule.isPending}
                  onClick={() => {
                    setError(null);
                    schedule.mutate({
                      milestones: latest.proposedPlan!.milestones,
                    });
                  }}
                >
                  Create accepted payment schedule
                </Button>
              )
            )}
          </>
        ) : editable && !closed ? (
          <>
            <label className="field">
              <span>Schedule type</span>
              <Select
                value={scheduleMode}
                onChange={(e) => {
                  setScheduleMode(e.target.value as "default" | "custom");
                  setReviewSchedule(false);
                }}
              >
                <option value="default">Company default</option>
                <option value="custom">Custom milestones</option>
              </Select>
            </label>
            {scheduleMode === "default" ? (
              <p>
                The company policy will set the initial amount and balance
                timing. Review the issued invoice total:{" "}
                <strong>{formatINR(total)}</strong>.
              </p>
            ) : (
              <>
                <p>
                  Enter 1–12 positive amounts summing to {formatINR(total)}. Due
                  dates use India time.
                </p>
                {milestones.map((m, i) => (
                  <div className="commercial-milestone" key={i}>
                    <Field label={`Milestone ${i + 1} label`}>
                      <Input
                        value={m.label}
                        onChange={(e) => {
                          setMilestones((a) =>
                            a.map((x, j) =>
                              j === i ? { ...x, label: e.target.value } : x,
                            ),
                          );
                          setReviewSchedule(false);
                        }}
                      />
                    </Field>
                    <Field label="Amount (INR)">
                      <Input
                        inputMode="decimal"
                        value={m.amount}
                        onChange={(e) => {
                          setMilestones((a) =>
                            a.map((x, j) =>
                              j === i ? { ...x, amount: e.target.value } : x,
                            ),
                          );
                          setReviewSchedule(false);
                        }}
                      />
                    </Field>
                    <Field label="Due on">
                      <Input
                        type="date"
                        min={indiaToday()}
                        value={m.dueOn}
                        onChange={(e) => {
                          setMilestones((a) =>
                            a.map((x, j) =>
                              j === i ? { ...x, dueOn: e.target.value } : x,
                            ),
                          );
                          setReviewSchedule(false);
                        }}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setMilestones((a) => a.filter((_, j) => j !== i));
                        setReviewSchedule(false);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={milestones.length >= 12}
                  onClick={() => {
                    setMilestones((a) => [
                      ...a,
                      { label: "", amount: "", dueOn: indiaToday() },
                    ]);
                    setReviewSchedule(false);
                  }}
                >
                  Add milestone
                </Button>
                <p>
                  Running sum:{" "}
                  {formatINR(
                    `${sum / 100n}.${String(sum % 100n).padStart(2, "0")}`,
                  )}{" "}
                  / {formatINR(total)}
                </p>
                {customError && <p className="field-error">{customError}</p>}
              </>
            )}
            {reviewSchedule ? (
              <div className="confirm-summary">
                <strong>Final review</strong>
                <p>
                  {scheduleMode === "default"
                    ? `Company default schedule for ${formatINR(total)}.`
                    : milestones
                        .map(
                          (m) =>
                            `${m.label}: ${formatINR(m.amount)} due ${m.dueOn}`,
                        )
                        .join(" · ")}
                </p>
                <p>This schedule cannot be edited after creation.</p>
                <Button
                  disabled={schedule.isPending}
                  onClick={() => {
                    setError(null);
                    schedule.mutate(
                      scheduleMode === "default"
                        ? {}
                        : {
                            milestones: milestones.map((m) => ({
                              ...m,
                              amount: normalizeMoney(m.amount)!,
                            })),
                          },
                    );
                  }}
                >
                  {schedule.isPending
                    ? "Saving…"
                    : "Confirm and create schedule"}
                </Button>
              </div>
            ) : (
              <Button
                disabled={scheduleMode === "custom" && Boolean(customError)}
                onClick={() => setReviewSchedule(true)}
              >
                Review schedule
              </Button>
            )}
          </>
        ) : (
          <p>
            Read only. Staff can create a schedule after the invoice is linked.
          </p>
        )}
      </section>
      <section className="commercial-card">
        <h2>Payment orders and receipts</h2>
        {d.orders.length ? (
          d.orders.map((o) => (
            <div
              className={`commercial-row ${o.status === "REVIEW_REQUIRED" ? "commercial-alert" : ""}`}
              key={o.id}
            >
              <div>
                <strong>
                  {formatINR(o.amount)} · {o.provider}
                </strong>
                <p>
                  Order {o.providerOrderId} · payment{" "}
                  {o.providerPaymentId ?? "—"} · paid {dateTime(o.paidAt)}
                </p>
                <p>
                  {o.receiptId ? `Receipt ${o.receiptId}` : "No receipt linked"}
                </p>
                {o.status === "REVIEW_REQUIRED" && (
                  <p>
                    Provider-confirmed funds need staff review. A receipt could
                    not safely be created; this does not mean a refund occurred.
                  </p>
                )}
              </div>
              <div>
                <StatusBadge value={o.status} />
                {editable &&
                  ["CREATING", "READY", "PENDING", "REVIEW_REQUIRED"].includes(
                    o.status,
                  ) && (
                    <Button
                      variant="secondary"
                      disabled={reconcile.isPending}
                      onClick={() => {
                        setError(null);
                        reconcile.mutate(o.id);
                      }}
                    >
                      {reconcile.isPending
                        ? "Retrying…"
                        : "Check provider status"}
                    </Button>
                  )}
              </div>
            </div>
          ))
        ) : (
          <Empty
            title="No payment orders"
            detail="Orders appear after customers begin paying scheduled milestones."
          />
        )}
        {d.invoice?.receipts?.length ? (
          <p>
            Gateway receipts:{" "}
            {d.invoice.receipts.map((r) => r.receiptNumber).join(", ")}. Open
            the invoice to inspect them.
          </p>
        ) : null}
      </section>
      {role === "CORE_ADMIN" && (
        <section className="commercial-card">
          <h2>Booking status</h2>
          <div className="commercial-actions">
            {(["CONFIRMED", "COMPLETED", "CANCELLED"] as const).map((s) => {
              const reason = statusReason(d, s);
              return (
                <div key={s}>
                  <Button
                    variant={s === "CANCELLED" ? "danger" : "secondary"}
                    disabled={
                      Boolean(reason) || status.isPending || b.status === s
                    }
                    title={reason ?? undefined}
                    onClick={() => {
                      if (
                        s !== "CANCELLED" ||
                        window.confirm(
                          "Cancel this booking? Paid bookings need a separate finance refund process; this action does not return money.",
                        )
                      ) {
                        setError(null);
                        status.mutate(s);
                      }
                    }}
                  >
                    {s}
                  </Button>
                  {reason && <small>{reason}</small>}
                </div>
              );
            })}
          </div>
          <p>
            Cancellation does not issue a refund; paid bookings require a
            separate finance process.
          </p>
        </section>
      )}
      {Boolean(error) && <ErrorState error={error} />}
    </>
  );
}
