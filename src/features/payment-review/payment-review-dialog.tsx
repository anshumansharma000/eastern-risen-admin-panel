"use client";

import { recordHref } from "@/lib/routes";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import type { CoreRole } from "@/lib/api/contracts";
import {
  Button,
  Checkbox,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { formatINR } from "@/lib/money";
import {
  formatTimestamp,
  humanize,
  useSessionExpiry,
} from "@/features/reports/report-shared";
import { paymentReviewApi } from "./api";
import type {
  PaymentReviewCase,
  ResolutionAction,
  ResolutionInput,
  ReviewReceipt,
  PaymentResolution,
} from "./contracts";
import {
  actionLabels,
  blockerLabels,
  conflictLabels,
  reasonLabels,
} from "./labels";

type Attempt = PaymentReviewCase["attempts"][number];
type Decision = { attemptId: string; action: ResolutionAction };
type Submission = { attemptId: string; body: ResolutionInput; key: string };
const money = (amount: string, currency: string) =>
  currency === "INR" ? `${formatINR(amount)} (INR)` : `${amount} ${currency}`;
const indiaInputTime = (timestamp: string) =>
  new Date(new Date(timestamp).getTime() + 330 * 60000)
    .toISOString()
    .slice(0, 19);

export function PaymentReviewDialog({
  orderId,
  role,
  onClose,
}: {
  orderId: string;
  role: CoreRole;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const queryKey = ["payment-review", orderId];
  const review = useQuery({
    queryKey,
    queryFn: ({ signal }) => paymentReviewApi.inspect(orderId, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [evidence, setEvidence] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [attested, setAttested] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [lockedConflict, setLockedConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const decisionPanel = useRef<HTMLElement>(null);
  const feedbackPanel = useRef<HTMLDivElement>(null);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!decision || !decisionPanel.current) return;
    decisionPanel.current.scrollIntoView?.({
      block: "start",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    decisionPanel.current
      .querySelector<HTMLElement>("select, input:not([readonly]), textarea")
      ?.focus({ preventScroll: true });
  }, [decision]);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (message || error)
      feedbackPanel.current?.scrollIntoView?.({
        block: "start",
        behavior: "auto",
      });
  }, [message, error]);
  useSessionExpiry(review.error);
  useSessionExpiry(error);
  const current = review.data?.data;
  const attempt = current?.attempts.find(
    (item) => item.id === decision?.attemptId,
  );
  const allowed =
    attempt?.actions.find((item) => item.action === decision?.action)
      ?.allowed === true;
  const refund = decision?.action === "RECORD_VERIFIED_EXTERNAL_REFUND";
  const locked = busy || submission !== null;
  const selectedReceipt = attempt?.matchingReceipts.find(
    (item) => item.id === receiptId,
  );
  const dateValue = completedAt
    ? new Date(
        `${completedAt}${completedAt.length === 16 ? ":00" : ""}+05:30`,
      ).getTime()
    : NaN;
  const validRefund = !!(
    attempt &&
    refundReference.trim() &&
    evidence.trim() &&
    attested &&
    Number.isFinite(dateValue) &&
    dateValue >=
      new Date(attempt.completedAt ?? attempt.initiatedAt).getTime() &&
    dateValue <= checkedAt
  );
  const canSubmit =
    role === "CORE_ADMIN" &&
    !locked &&
    !review.isFetching &&
    !review.isError &&
    allowed &&
    !!note.trim() &&
    confirmed &&
    (decision?.action !== "LINK_EXISTING_RECEIPT" || !!selectedReceipt) &&
    (!refund || validRefund);

  async function refreshFinancialState() {
    await Promise.allSettled([
      cache.invalidateQueries({ queryKey: ["report"] }),
      cache.invalidateQueries({ queryKey: ["invoice"] }),
      cache.invalidateQueries({ queryKey: ["invoices"] }),
      cache.invalidateQueries({ queryKey: ["receivables"] }),
      cache.invalidateQueries({ queryKey: ["commercial-booking"] }),
      cache.invalidateQueries({ queryKey: ["commercial-bookings"] }),
      cache.invalidateQueries({ queryKey: ["reports"] }),
    ]);
  }
  function selectAction(
    item: Attempt,
    action: ResolutionAction,
    trigger: HTMLButtonElement,
  ) {
    actionTrigger.current = trigger;
    setDecision({ attemptId: item.id, action });
    setNote("");
    setReceiptId("");
    setRefundReference("");
    setEvidence("");
    setCompletedAt("");
    setAttested(false);
    setConfirmed(false);
    setError(null);
    setMessage("");
  }
  async function send(captured: Submission) {
    if (running.current || role !== "CORE_ADMIN") return;
    running.current = true;
    setBusy(true);
    setError(null);
    setMessage("");
    setSubmission(captured);
    try {
      const response = await paymentReviewApi.resolve(
        captured.attemptId,
        captured.body,
        captured.key,
      );
      cache.setQueryData(queryKey, { data: response.data.review });
      setSubmission(null);
      setLockedConflict(false);
      setDecision(null);
      setConfirmed(false);
      setMessage(
        "Decision recorded. The case below reflects the backend's current state; other unresolved payments still require review.",
      );
      await refreshFinancialState();
    } catch (failure) {
      setError(failure);
      const uncertain =
        !(failure instanceof ApiError) ||
        failure.status === 0 ||
        failure.status >= 500;
      if (uncertain) {
        setMessage(
          "The outcome is uncertain. Keep this dialog open and retry the exact captured decision. Its original submission key and details are retained.",
        );
      } else if (failure.code === "PAYMENT_RESOLUTION_IDEMPOTENCY_CONFLICT") {
        setLockedConflict(true);
        setMessage(conflictLabels[failure.code]);
        await review.refetch();
        await refreshFinancialState();
      } else {
        setSubmission(null);
        setConfirmed(false);
        setMessage(
          conflictLabels[failure.code] ??
            "The decision was not accepted. Check the error and current eligibility before confirming again.",
        );
        if (failure.status === 409) {
          setDecision(null);
          await review.refetch();
          await refreshFinancialState();
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function submit() {
    if (!canSubmit || !decision || !attempt || !current) return;
    const common = { version: current.version, note: note.trim() };
    let body: ResolutionInput;
    if (decision.action === "LINK_EXISTING_RECEIPT")
      body = { ...common, action: decision.action, receiptId };
    else if (decision.action === "RECORD_VERIFIED_EXTERNAL_REFUND")
      body = {
        ...common,
        action: decision.action,
        refund: {
          providerRefundReference: refundReference.trim(),
          amount: attempt.amount,
          currency: attempt.currency,
          completedAt: new Date(dateValue).toISOString(),
          verification: {
            kind: "STAFF_ATTESTATION",
            evidenceReference: evidence.trim(),
            attested: true,
          },
        },
      };
    else body = { ...common, action: decision.action };
    void send({ attemptId: attempt.id, body, key: crypto.randomUUID() });
  }
  async function checkProvider() {
    if (running.current || locked || role === "CORE_REPORT_VIEWER") return;
    running.current = true;
    setBusy(true);
    setError(null);
    setDecision(null);
    setConfirmed(false);
    setMessage("");
    try {
      await paymentReviewApi.reconcile(orderId);
      await review.refetch();
      await refreshFinancialState();
      setMessage(
        "Provider status checked. This check does not make a staff accounting decision.",
      );
    } catch (failure) {
      setError(failure);
      await review.refetch();
      await refreshFinancialState();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      protectChanges={false}
      title="Review gateway payment"
      className="payment-review-modal"
      eyebrow="Payment review"
      closeDisabled={locked}
      headerActions={
        current ? (
          <div className="payment-review-actions">
            <Button
              variant="secondary"
              disabled={locked || review.isFetching}
              onClick={() => {
                setDecision(null);
                setConfirmed(false);
                void review.refetch();
              }}
            >
              {review.isFetching ? "Refreshing…" : "Refresh case"}
            </Button>
            {role !== "CORE_REPORT_VIEWER" && (
              <Button
                variant="secondary"
                disabled={locked || review.isFetching || review.isError}
                onClick={() => void checkProvider()}
              >
                {busy && !submission ? "Checking…" : "Check provider status"}
              </Button>
            )}
          </div>
        ) : undefined
      }
      subtitle="Provider payment facts and staff accounting decisions are separate."
      onClose={() => {
        if (!locked) onClose();
      }}
    >
      <div className="payment-review-dialog">
        <div ref={feedbackPanel} className="payment-review-feedback">
          {message && (
            <p role="status" className="payment-review-notice">
              {message}
            </p>
          )}
          {error != null && <ErrorState error={error} />}
          {review.isError && (
            <ErrorState error={review.error} onRetry={() => review.refetch()} />
          )}
          {submission && (
            <section
              className="payment-review-notice"
              aria-label="Captured decision"
            >
              <p>
                Captured decision: {actionLabels[submission.body.action]} ·
                attempt {submission.attemptId}. Keep this dialog open until the
                outcome is resolved.
              </p>
              <p>Note: {submission.body.note}</p>
              {submission.body.action === "RECORD_VERIFIED_EXTERNAL_REFUND" && (
                <p>
                  {submission.body.refund.amount}{" "}
                  {submission.body.refund.currency} · refund{" "}
                  {submission.body.refund.providerRefundReference}
                </p>
              )}
              {lockedConflict ? (
                <Button
                  disabled={busy || review.isFetching || review.isError}
                  variant="secondary"
                  onClick={() => {
                    setSubmission(null);
                    setDecision(null);
                    setConfirmed(false);
                    setLockedConflict(false);
                    setMessage(
                      "Select an action from the refreshed case and confirm a new decision.",
                    );
                  }}
                >
                  Start a new decision after inspecting this conflict
                </Button>
              ) : (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => void send(submission)}
                >
                  Retry exact captured decision
                </Button>
              )}
            </section>
          )}
        </div>
        {review.isLoading && <Loading label="Loading payment review" />}
        {current && (
          <>
            <h3 className="payment-case-heading">Payment overview</h3>
            <dl className="payment-facts payment-case-facts">
              <Fact label="Provider" value={current.order.provider} />

              <Fact
                label="Provider order status"
                value={current.order.providerStatus ?? "—"}
              />
              <Fact
                label="Gateway accounting disposition"
                value={humanize(current.order.gatewayStatus)}
              />
              <Fact
                label="Order face amount"
                value={formatINR(current.order.amount)}
              />
              <Fact
                label="Payment timestamp (India time)"
                value={formatTimestamp(current.order.paidAt)}
              />
              <Fact label="Customer" value={current.customer?.name ?? "—"} />

              <Fact
                label="Booking"
                value={
                  current.booking ? (
                    <Link
                      aria-disabled={locked}
                      onClick={(event) => {
                        if (locked) event.preventDefault();
                      }}
                      className="text-link"
                      href={recordHref("commercial-detail", current.booking.id)}
                    >
                      {current.booking.reference}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Fact
                label="Booking status"
                value={current.booking?.status ?? "—"}
              />
              <Fact
                label="Invoice"
                value={
                  current.invoice ? (
                    <Link
                      aria-disabled={locked}
                      onClick={(event) => {
                        if (locked) event.preventDefault();
                      }}
                      className="text-link"
                      href={recordHref("invoice-detail", current.invoice.id)}
                    >
                      {current.invoice.number || "View invoice"}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Fact
                label="Invoice status"
                value={current.invoice?.status ?? "—"}
              />
              <Fact
                label="Current invoice balance"
                value={formatINR(current.invoice?.dueAmount)}
              />
              <Fact
                label="Confirmed invoice receipts"
                value={formatINR(current.invoice?.receivedAmount)}
              />
            </dl>
            <details className="payment-review-references">
              <summary>Order and receipt references</summary>
              <dl className="payment-facts">
                <Fact label="Order ID" value={current.order.id} />
                <Fact
                  label="Canonical receipt ID"
                  value={current.order.receiptId ?? "—"}
                />
                <Fact
                  label="Provider order reference"
                  value={current.order.providerOrderId}
                />
                <Fact
                  label="Company ID"
                  value={current.booking?.companyId ?? "—"}
                />
              </dl>
            </details>
            {role !== "CORE_ADMIN" && (
              <p className="report-meta">
                Inspection only. A Core administrator must record financial
                decisions.
              </p>
            )}
            <div className="payment-attempts-heading">
              <h3>Payment attempts</h3>
              <span>Latest first · India time</span>
            </div>
            {!current.attempts.length && <p>No payment attempts recorded.</p>}
            {[...current.attempts]
              .sort(
                (a, b) =>
                  new Date(b.initiatedAt).getTime() -
                    new Date(a.initiatedAt).getTime() ||
                  b.id.localeCompare(a.id),
              )
              .map((item, index) => (
                <section
                  className={`payment-review-attempt ${decision?.attemptId === item.id ? "is-selected" : ""}`}
                  key={item.id}
                  aria-label={`Payment attempt ${item.providerPaymentId}`}
                >
                  <div className="payment-attempt-heading">
                    <div>
                      <p className="eyebrow">
                        Attempt {current.attempts.length - index}
                        {index === 0 ? " · Latest" : ""}
                      </p>
                      <h4>{money(item.amount, item.currency)}</h4>
                      <p className="payment-attempt-reference">
                        Payment {item.providerPaymentId}
                      </p>
                    </div>
                    <time dateTime={item.initiatedAt}>
                      {formatTimestamp(item.initiatedAt)}
                    </time>
                  </div>
                  <dl className="payment-facts">
                    <Fact label="Attempt ID" value={item.id} />
                    <Fact
                      label="Provider payment status"
                      value={<StatusBadge value={item.status} />}
                    />
                    <Fact
                      label="Accounting status"
                      value={<StatusBadge value={item.accountingStatus} />}
                    />
                    <Fact
                      label="Receipt accounting state"
                      value={
                        item.receiptAccountingState
                          ? humanize(item.receiptAccountingState)
                          : "—"
                      }
                    />
                    <Fact
                      label="Initiated (India time)"
                      value={formatTimestamp(item.initiatedAt)}
                    />
                    <Fact
                      label="Completed (India time)"
                      value={formatTimestamp(item.completedAt)}
                    />
                  </dl>
                  {item.receiptAccountingState ===
                    "REVERSED_WITHOUT_REFUND" && (
                    <p className="payment-review-notice">
                      Receipt reversed without a recorded refund. The successful
                      payment remains unresolved; a reversed receipt does not
                      establish that money was refunded. A prior terminal
                      decision may require a separate accounting amendment.
                    </p>
                  )}
                  <h4>Recorded review reasons</h4>
                  {item.reviewReasons.length ? (
                    <ul>
                      {item.reviewReasons.map((reason, index) => (
                        <li key={index}>
                          {reasonLabels[reason.code]}
                          {Object.entries(reason.details).map(
                            ([key, value]) => (
                              <small className="table-sub" key={key}>
                                {humanize(key)}: {value}
                              </small>
                            ),
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No persisted review reasons.</p>
                  )}
                  <h4>Receipt links</h4>
                  {item.receipt ? (
                    <ReceiptFacts receipt={item.receipt} locked={locked} />
                  ) : (
                    <p>No receipt linked to this attempt.</p>
                  )}
                  {!!item.existingPaymentReceipts.length && (
                    <details>
                      <summary>Existing payment receipts</summary>
                      {item.existingPaymentReceipts.map((receipt) => (
                        <ReceiptFacts
                          key={receipt.id}
                          receipt={receipt}
                          locked={locked}
                        />
                      ))}
                    </details>
                  )}
                  <h4>Current action eligibility</h4>
                  <p className="report-meta">
                    These checks describe the current case; they are separate
                    from the original recorded review reasons.
                  </p>
                  <div className="payment-review-eligibility">
                    {item.actions.map((action) => (
                      <div key={action.action}>
                        {role === "CORE_ADMIN" ? (
                          <Button
                            variant="secondary"
                            disabled={
                              !action.allowed ||
                              locked ||
                              review.isFetching ||
                              review.isError
                            }
                            aria-expanded={
                              decision?.attemptId === item.id &&
                              decision.action === action.action
                            }
                            aria-controls={`payment-decision-${item.id}`}
                            onClick={(event) =>
                              selectAction(
                                item,
                                action.action,
                                event.currentTarget,
                              )
                            }
                          >
                            {actionLabels[action.action]}
                          </Button>
                        ) : (
                          <strong>{actionLabels[action.action]}</strong>
                        )}
                        <p>{action.allowed ? "Available" : "Unavailable"}</p>
                        {!!action.blockers.length && (
                          <ul>
                            {action.blockers.map((code) => (
                              <li key={code}>{blockerLabels[code] ?? code}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                  {role === "CORE_ADMIN" &&
                    decision &&
                    attempt &&
                    decision.attemptId === item.id && (
                      <section
                        className="payment-review-decision"
                        id={`payment-decision-${item.id}`}
                        ref={decisionPanel}
                        aria-label="Confirm payment decision"
                      >
                        <div className="payment-decision-heading">
                          <h3>{actionLabels[decision.action]}</h3>
                          <Button
                            variant="ghost"
                            disabled={locked}
                            onClick={() => {
                              setDecision(null);
                              setConfirmed(false);
                              actionTrigger.current?.focus();
                            }}
                          >
                            Cancel decision
                          </Button>
                        </div>
                        <p>
                          Payment {attempt.providerPaymentId} ·{" "}
                          {money(attempt.amount, attempt.currency)}.
                        </p>
                        {decision.action === "APPLY_TO_LINKED_INVOICE" && (
                          <p>
                            Create a confirmed gateway receipt for the actual
                            received amount on invoice{" "}
                            {current.invoice?.number ?? current.invoice?.id}.
                            This changes the invoice balance.
                          </p>
                        )}
                        {decision.action === "LINK_EXISTING_RECEIPT" && (
                          <>
                            <p>
                              Attribute an existing authoritative gateway
                              receipt to this payment. This does not create
                              another receipt or change confirmed invoice
                              balances.
                            </p>
                            <Field label="Matching receipt">
                              <Select
                                disabled={locked}
                                value={receiptId}
                                onChange={(e) => {
                                  setReceiptId(e.target.value);
                                  setConfirmed(false);
                                }}
                              >
                                <option value="">
                                  Select a backend matching receipt
                                </option>
                                {attempt.matchingReceipts.map((receipt) => (
                                  <option value={receipt.id} key={receipt.id}>
                                    {receipt.number} ·{" "}
                                    {formatINR(receipt.amount)} ·{" "}
                                    {receipt.receivedDate} · {receipt.status}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            {selectedReceipt && (
                              <>
                                <ReceiptFacts
                                  receipt={selectedReceipt}
                                  locked={locked}
                                />
                                <p>
                                  Evidence: {selectedReceipt.evidenceKind} — the
                                  backend verified the gateway payment identity
                                  of this receipt.
                                </p>
                              </>
                            )}
                          </>
                        )}
                        {refund && (
                          <>
                            <p className="payment-review-notice">
                              Record a refund already completed elsewhere. This
                              action does not issue a refund or independently
                              verify it with the provider. Only a full refund of{" "}
                              {money(attempt.amount, attempt.currency)} can be
                              recorded.
                            </p>
                            <Field label="Full refund amount and currency">
                              <Input
                                readOnly
                                value={`${attempt.amount} ${attempt.currency}`}
                              />
                            </Field>
                            <Field label="Provider refund reference">
                              <Input
                                disabled={locked}
                                maxLength={200}
                                value={refundReference}
                                onChange={(e) => {
                                  setRefundReference(e.target.value);
                                  setConfirmed(false);
                                }}
                              />
                            </Field>
                            <Field
                              label="Documentary evidence reference"
                              hint="Retain this evidence externally; this screen does not upload documents."
                            >
                              <Input
                                disabled={locked}
                                maxLength={1000}
                                value={evidence}
                                onChange={(e) => {
                                  setEvidence(e.target.value);
                                  setConfirmed(false);
                                }}
                              />
                            </Field>
                            <Field label="Refund completed at (India time)">
                              <Input
                                disabled={locked}
                                type="datetime-local"
                                step={1}
                                value={completedAt}
                                min={indiaInputTime(
                                  attempt.completedAt ?? attempt.initiatedAt,
                                )}
                                max={indiaInputTime(
                                  new Date(checkedAt).toISOString(),
                                )}
                                onChange={(e) => {
                                  setCompletedAt(e.target.value);
                                  setCheckedAt(Date.now());
                                  setConfirmed(false);
                                }}
                              />
                            </Field>
                            <label className="payment-review-check">
                              <Checkbox
                                disabled={locked}
                                checked={attested}
                                onChange={(e) => {
                                  setAttested(e.target.checked);
                                  setConfirmed(false);
                                }}
                              />
                              I attest as an administrator that this full
                              external refund was completed and that the
                              referenced evidence is retained. Verification is
                              STAFF_ATTESTATION.
                            </label>
                          </>
                        )}
                        <Field label="Staff note">
                          <Textarea
                            disabled={locked}
                            maxLength={2000}
                            value={note}
                            onChange={(e) => {
                              setNote(e.target.value);
                              setConfirmed(false);
                            }}
                          />
                        </Field>
                        <label className="payment-review-check">
                          <Checkbox
                            disabled={locked}
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />
                          I confirm payment {attempt.providerPaymentId}, amount{" "}
                          {attempt.amount} {attempt.currency}, and the outcome:{" "}
                          {actionLabels[decision.action]}
                          {selectedReceipt ? ` ${selectedReceipt.number}` : ""}
                          {refundReference && refund
                            ? ` (${refundReference.trim()})`
                            : ""}
                          .
                        </label>
                        <Button
                          disabled={!canSubmit}
                          variant={refund ? "danger" : "primary"}
                          onClick={submit}
                        >
                          {busy ? "Recording…" : "Record confirmed decision"}
                        </Button>
                      </section>
                    )}
                </section>
              ))}
            <h3>Resolution history</h3>
            <ResolutionHistory history={current.history} />
          </>
        )}
      </div>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function ReceiptFacts({
  receipt,
  locked = false,
}: {
  receipt: ReviewReceipt;
  locked?: boolean;
}) {
  return (
    <p>
      <Link
        aria-disabled={locked}
        onClick={(event) => {
          if (locked) event.preventDefault();
        }}
        className="text-link"
        href={recordHref("invoice-detail", receipt.invoiceId)}
      >
        {receipt.number}
      </Link>{" "}
      · {receipt.id} · {formatINR(receipt.amount)} · {receipt.receivedDate} ·{" "}
      {receipt.method} · {receipt.status}
      {receipt.reversalReason && ` · ${receipt.reversalReason}`}
    </p>
  );
}
export function ResolutionHistory({
  history,
}: {
  history: Array<
    Pick<
      PaymentResolution,
      | "id"
      | "attemptId"
      | "action"
      | "actorId"
      | "note"
      | "receiptId"
      | "amount"
      | "currency"
      | "providerRefundReference"
      | "refund"
      | "createdAt"
    >
  >;
}) {
  return history.length ? (
    <div className="payment-resolution-history">
      {history.map((item) => (
        <section key={item.id}>
          <h4>
            {actionLabels[item.action]} · {money(item.amount, item.currency)}
          </h4>
          <p>
            Attempt {item.attemptId} · recorded by {item.actorId} ·{" "}
            {formatTimestamp(item.createdAt)}
          </p>
          <p>{item.note}</p>
          {item.receiptId && <p>Receipt ID: {item.receiptId}</p>}
          {item.refund && (
            <dl className="payment-facts">
              <Fact
                label="External refund reference"
                value={
                  item.providerRefundReference ??
                  item.refund.providerRefundReference
                }
              />
              <Fact
                label="Completed external refund"
                value={money(item.refund.amount, item.refund.currency)}
              />
              <Fact
                label="Refund completed (India time)"
                value={formatTimestamp(item.refund.completedAt)}
              />
              <Fact
                label="Verification"
                value="STAFF_ATTESTATION — recorded by an administrator; not independently verified with the provider"
              />
              <Fact
                label="Documentary evidence"
                value={item.refund.verification.evidenceReference}
              />
              <Fact
                label="Administrator attested"
                value={item.refund.verification.attested ? "Yes" : "No"}
              />
            </dl>
          )}
        </section>
      ))}
    </div>
  ) : (
    <p>No staff resolutions recorded.</p>
  );
}
