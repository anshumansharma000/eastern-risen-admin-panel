"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { useFormGuard } from "@/components/form-guard";
import { formatINR, moneyToPaise, normalizeMoney } from "@/lib/money";
import { commercialApi, type Booking, type Quote } from "./api";
import type {
  CalculateQuoteRequest,
  CalculateQuoteResponse,
  ProposedMilestone,
  ServiceLine,
  TaxTreatment,
} from "./billing-contracts";
import { indiaToday, scheduleError } from "./rules";
import { QuoteBreakdown } from "./quote-breakdown";

type EditableLine = ServiceLine & { key: string };
const newLine = (): EditableLine => ({
  key: crypto.randomUUID(),
  description: "",
  amount: "",
  taxTreatment: "TAXABLE",
  taxComponents: ["IGST"],
});

export function QuoteComposer({
  booking,
  latest,
  onSaved,
}: {
  booking: Booking;
  latest?: Quote;
  onSaved: (quote: Quote) => void | Promise<void>;
}) {
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(!latest);
  const summary = useRef<HTMLElement>(null);
  const [lines, setLines] = useState<EditableLine[]>([newLine()]);
  const [date, setDate] = useState(indiaToday);
  const [mode, setMode] = useState<"COMPANY_DEFAULT" | "CUSTOM">(
    booking.serviceStartsOn ? "COMPANY_DEFAULT" : "CUSTOM",
  );
  const [milestones, setMilestones] = useState<ProposedMilestone[]>([
    { label: "Initial payment", amount: "", dueOn: indiaToday() },
  ]);
  const [preview, setPreview] = useState<CalculateQuoteResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const clearGuard = useFormGuard(dirty, saving);
  const generation = useRef(0);
  const busySave = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const customSum = milestones.every((m) => normalizeMoney(m.amount))
    ? milestones.reduce((sum, m) => sum + moneyToPaise(m.amount), 0n)
    : null;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function invalidate() {
    setDirty(true);
    generation.current++;
    setPreview(null);
    setError(null);
    setCalculating(false);
  }
  function payload(): CalculateQuoteRequest {
    const normalized = lines.map(
      ({ description, amount, taxTreatment, taxComponents }) => {
        const money = normalizeMoney(amount);
        if (!description.trim() || !money)
          throw new Error(
            "Every service line needs a description and a valid INR amount with at most two decimal places.",
          );
        return {
          description: description.trim(),
          amount: money,
          taxTreatment,
          taxComponents: taxTreatment === "TAXABLE" ? taxComponents : [],
        };
      },
    );
    if (!date) throw new Error("Provide the tax effective date.");
    if (mode === "COMPANY_DEFAULT" && !booking.serviceStartsOn)
      throw new Error(
        "Company default requires a service start date. Choose custom milestones.",
      );
    if (mode === "CUSTOM") {
      for (const m of milestones)
        if (
          !m.label.trim() ||
          !normalizeMoney(m.amount) ||
          moneyToPaise(m.amount) <= 0n ||
          !m.dueOn ||
          m.dueOn < indiaToday()
        )
          throw new Error(
            "Each milestone needs a label, positive amount, and an India-local due date today or later.",
          );
    }
    return {
      lines: normalized,
      taxEffectiveDate: date,
      paymentPlan:
        mode === "COMPANY_DEFAULT"
          ? { mode }
          : {
              mode,
              milestones: milestones.map((m) => ({
                ...m,
                label: m.label.trim(),
                amount: normalizeMoney(m.amount)!,
              })),
            },
    };
  }
  async function calculate() {
    setError(null);
    const ticket = ++generation.current;
    try {
      const body = payload();
      setCalculating(true);
      setPreview(null);
      const result = await commercialApi.calculateQuote(booking.id, body);
      if (ticket !== generation.current) return;
      if (body.paymentPlan.mode === "CUSTOM") {
        const issue = scheduleError(
          body.paymentPlan.milestones,
          result.data.pricing.grandTotal,
          indiaToday(),
        );
        if (issue) throw new Error(issue);
      }
      setPreview(result.data);
    } catch (e) {
      if (ticket === generation.current) setError(e);
    } finally {
      if (ticket === generation.current) setCalculating(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview || busySave.current) return;
    busySave.current = true;
    setSaving(true);
    setError(null);
    try {
      const f = new FormData(e.currentTarget);
      const description = String(f.get("description") || "").trim();
      const terms = String(f.get("terms") || "").trim();
      if (!description || !terms)
        throw new Error(
          "Description and payment/cancellation terms cannot be blank.",
        );
      const result = await commercialApi.quote(booking.id, {
        ...payload(),
        description,
        terms,
        inclusions: String(f.get("inclusions") || "").trim(),
        exclusions: String(f.get("exclusions") || "").trim(),
        expiresOn: String(f.get("expiresOn") || "") || null,
      });
      clearGuard();
      setDirty(false);
      setPreview(null);
      form.current?.reset();
      generation.current++;
      setLines([newLine()]);
      setDate(indiaToday());
      setMode(booking.serviceStartsOn ? "COMPANY_DEFAULT" : "CUSTOM");
      setMilestones([
        { label: "Initial payment", amount: "", dueOn: indiaToday() },
      ]);
      setCalculating(false);
      setExpanded(false);
      summary.current?.focus();
      await onSaved(result.data);
    } catch (e) {
      setError(e);
    } finally {
      busySave.current = false;
      setSaving(false);
    }
  }
  function updateLine(index: number, change: Partial<EditableLine>) {
    setLines((a) => a.map((l, i) => (i === index ? { ...l, ...change } : l)));
  }
  function move(index: number, delta: number) {
    const next = [...lines];
    const [line] = next.splice(index, 1);
    next.splice(index + delta, 0, line);
    setLines(next);
    invalidate();
  }
  return (
    <details
      className="quote-composer"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary ref={summary}>
        {latest ? "Create revised quote" : "Create quote"}
      </summary>
      <form
        ref={form}
        className="record-form"
        onSubmit={save}
        onChange={invalidate}
      >
        <p>
          Prepare the price breakdown and payment terms together. A revision
          requires fresh customer acceptance.
        </p>
        <fieldset disabled={saving} className="billing-fieldset">
          <Field label="Description">
            <Textarea name="description" required />
          </Field>
          <Field label="Inclusions">
            <Textarea name="inclusions" />
          </Field>
          <Field label="Exclusions">
            <Textarea name="exclusions" />
          </Field>
          <Field label="Payment and cancellation terms">
            <Textarea name="terms" required />
          </Field>
          <Field label="Expires on">
            <Input name="expiresOn" type="date" />
          </Field>
          <Field label="Tax effective date">
            <Input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <h4>Service lines</h4>
          {lines.map((l, i) => (
            <div className="quote-line" key={l.key}>
              <strong>Line {i + 1}</strong>
              <div className="form-grid">
                <Field label={`Line ${i + 1} description`}>
                  <Input
                    value={l.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label={`Line ${i + 1} amount (INR)`}>
                  <Input
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                    required
                  />
                </Field>
                <Field label={`Line ${i + 1} tax treatment`}>
                  <Select
                    value={l.taxTreatment}
                    onChange={(e) =>
                      updateLine(i, {
                        taxTreatment: e.target.value as TaxTreatment,
                        taxComponents:
                          e.target.value === "TAXABLE" ? ["IGST"] : [],
                      })
                    }
                  >
                    <option value="TAXABLE">Taxable</option>
                    <option value="NON_TAXABLE">Non-taxable</option>
                    <option value="EXEMPT">Exempt</option>
                    <option value="NIL_RATED">Nil-rated</option>
                  </Select>
                </Field>
                {l.taxTreatment === "TAXABLE" && (
                  <Field label={`Line ${i + 1} GST components`}>
                    <Select
                      value={
                        l.taxComponents.includes("IGST") ? "IGST" : "CGST_SGST"
                      }
                      onChange={(e) =>
                        updateLine(i, {
                          taxComponents:
                            e.target.value === "IGST"
                              ? ["IGST"]
                              : ["CGST", "SGST"],
                        })
                      }
                    >
                      <option value="IGST">IGST</option>
                      <option value="CGST_SGST">CGST + SGST</option>
                    </Select>
                  </Field>
                )}
              </div>
              <div className="commercial-actions">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Move line ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  Move up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Move line ${i + 1} down`}
                  disabled={i === lines.length - 1}
                  onClick={() => move(i, 1)}
                >
                  Move down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => {
                    setLines((a) => a.filter((_, j) => j !== i));
                    invalidate();
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={lines.length >= 200}
            onClick={() => {
              setLines((a) => [...a, newLine()]);
              invalidate();
            }}
          >
            Add service line
          </Button>
          <h4>Proposed payment plan</h4>
          <Field label="Payment plan">
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option
                value="COMPANY_DEFAULT"
                disabled={!booking.serviceStartsOn}
              >
                Company default
              </option>
              <option value="CUSTOM">Custom milestones</option>
            </Select>
          </Field>
          {!booking.serviceStartsOn && (
            <p className="muted">
              Company default requires a service start date. Use custom
              milestones for this booking.
            </p>
          )}
          {mode === "CUSTOM" && (
            <>
              {milestones.map((m, i) => (
                <div className="commercial-milestone" key={i}>
                  <Field label={`Payment ${i + 1} label`}>
                    <Input
                      value={m.label}
                      required
                      onChange={(e) =>
                        setMilestones((a) =>
                          a.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`Payment ${i + 1} amount (INR)`}>
                    <Input
                      value={m.amount}
                      inputMode="decimal"
                      required
                      onChange={(e) =>
                        setMilestones((a) =>
                          a.map((x, j) =>
                            j === i ? { ...x, amount: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`Payment ${i + 1} due on`}>
                    <Input
                      type="date"
                      value={m.dueOn}
                      min={indiaToday()}
                      required
                      onChange={(e) =>
                        setMilestones((a) =>
                          a.map((x, j) =>
                            j === i ? { ...x, dueOn: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove payment ${i + 1}`}
                    disabled={milestones.length === 1}
                    onClick={() => {
                      setMilestones((a) => a.filter((_, j) => j !== i));
                      invalidate();
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
                  invalidate();
                }}
              >
                Add payment milestone
              </Button>
              <p>Amounts must exactly equal the calculated quote total.</p>
              {customSum !== null && (
                <p>
                  Milestone total:{" "}
                  {formatINR(
                    `${customSum / 100n}.${String(customSum % 100n).padStart(2, "0")}`,
                  )}
                </p>
              )}
            </>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={calculating}
            onClick={calculate}
          >
            {calculating ? "Calculating…" : "Calculate and review quote"}
          </Button>
          {preview && (
            <section aria-label="Calculated quote">
              <QuoteBreakdown
                pricing={preview.pricing}
                plan={preview.proposedPlan}
              />
              <p>
                Review these amounts and dates before creating the quote. The
                saved quote will show the final agreed terms.
              </p>
            </section>
          )}
          {Boolean(error) && <ErrorState error={error} />}
          <Button disabled={!preview || calculating}>
            {saving ? "Saving…" : "Create new quote version"}
          </Button>
        </fieldset>
      </form>
    </details>
  );
}
