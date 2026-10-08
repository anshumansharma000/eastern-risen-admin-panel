"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoreRole } from "@/lib/api/contracts";
import { useFormGuard } from "@/components/form-guard";
import { formatINR } from "@/lib/money";
import { indiaToday } from "./rules";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Loading,
  SuccessNotice,
} from "@/components/ui";
import { apiFieldError } from "@/lib/api/client";
import { MasterPicker } from "./picker";
import { commercialApi } from "./api";

export function PolicyPage({ role }: { role: CoreRole }) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [example, setExample] = useState<{
    companyId: string;
    initialPercent: number;
    balanceDaysBefore: number;
    fullPaymentWithinDays: number;
  } | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const cache = useQueryClient();
  const policy = useQuery({
    queryKey: ["commercial-policy", companyId],
    queryFn: ({ signal }) => commercialApi.policy(companyId, signal),
    enabled: Boolean(companyId),
  });
  const save = useMutation({
    mutationFn: (body: Parameters<typeof commercialApi.updatePolicy>[1]) =>
      commercialApi.updatePolicy(companyId, body),
    onSuccess: async () => {
      clearGuard();
      setDirty(false);
      setSaved(true);
      setError(null);
      await cache.invalidateQueries({
        queryKey: ["commercial-policy", companyId],
      });
    },
    onError: setError,
  });
  const clearGuard = useFormGuard(dirty, save.isPending);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (role !== "CORE_ADMIN") return;
    const f = new FormData(e.currentTarget);
    const body = {
      initialPercent: Number(f.get("initialPercent")),
      balanceDaysBefore: Number(f.get("balanceDaysBefore")),
      fullPaymentWithinDays: Number(f.get("fullPaymentWithinDays")),
    };
    if (
      !Number.isInteger(body.initialPercent) ||
      body.initialPercent < 1 ||
      body.initialPercent > 99 ||
      !Number.isInteger(body.balanceDaysBefore) ||
      body.balanceDaysBefore < 1 ||
      body.balanceDaysBefore > 365 ||
      !Number.isInteger(body.fullPaymentWithinDays) ||
      body.fullPaymentWithinDays < 0 ||
      body.fullPaymentWithinDays > 365
    ) {
      setError(new Error("Enter whole numbers within the displayed ranges."));
      return;
    }
    setError(null);
    save.mutate(body);
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Commercial bookings</p>
          <h1>Company payment policy</h1>
          <p>
            Sets the default milestone schedule for newly invoiced bookings.
          </p>
        </div>
      </header>
      <section className="commercial-card">
        <MasterPicker
          resource="companies"
          label="Company"
          value={companyId}
          onChange={(value) => {
            if (dirty && !window.confirm("Discard the unsaved policy changes?"))
              return;
            clearGuard();
            setDirty(false);
            setSaved(false);
            setCompanyId(value);
          }}
        />
        {companyId &&
          (policy.isLoading ? (
            <Loading label="Loading policy" />
          ) : policy.isError ? (
            <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
          ) : (
            <form
              key={`${companyId}-${policy.data?.data.updatedAt}`}
              className="record-form"
              onSubmit={submit}
              onChange={(event) => {
                setDirty(true);
                setSaved(false);
                const values = new FormData(event.currentTarget);
                setExample({
                  companyId,
                  initialPercent: Number(values.get("initialPercent")),
                  balanceDaysBefore: Number(values.get("balanceDaysBefore")),
                  fullPaymentWithinDays: Number(
                    values.get("fullPaymentWithinDays"),
                  ),
                });
              }}
            >
              <Field
                label="Initial payment percent (1–99)"
                hint="The initial amount due after invoicing."
                error={apiFieldError(error, "initialPercent")}
              >
                <Input
                  name="initialPercent"
                  type="number"
                  min="1"
                  max="99"
                  required
                  defaultValue={policy.data!.data.initialPercent}
                  readOnly={role !== "CORE_ADMIN"}
                />
              </Field>
              <Field
                label="Balance days before travel (1–365)"
                hint="Balance is due this many days before the service starts."
                error={apiFieldError(error, "balanceDaysBefore")}
              >
                <Input
                  name="balanceDaysBefore"
                  type="number"
                  min="1"
                  max="365"
                  required
                  defaultValue={policy.data!.data.balanceDaysBefore}
                  readOnly={role !== "CORE_ADMIN"}
                />
              </Field>
              <Field
                label="Full payment within days (0–365)"
                hint="When travel is this close, the default schedule requests 100% immediately."
                error={apiFieldError(error, "fullPaymentWithinDays")}
              >
                <Input
                  name="fullPaymentWithinDays"
                  type="number"
                  min="0"
                  max="365"
                  required
                  defaultValue={policy.data!.data.fullPaymentWithinDays}
                  readOnly={role !== "CORE_ADMIN"}
                />
              </Field>
              <PolicyExample
                initialPercent={
                  example?.companyId === companyId
                    ? example.initialPercent
                    : policy.data!.data.initialPercent
                }
                balanceDaysBefore={
                  example?.companyId === companyId
                    ? example.balanceDaysBefore
                    : policy.data!.data.balanceDaysBefore
                }
                fullPaymentWithinDays={
                  example?.companyId === companyId
                    ? example.fullPaymentWithinDays
                    : policy.data!.data.fullPaymentWithinDays
                }
              />
              {role === "CORE_ADMIN" && (
                <footer>
                  <Button disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save policy"}
                  </Button>
                </footer>
              )}
            </form>
          ))}
        {saved && <SuccessNotice>Payment policy saved.</SuccessNotice>}
        {Boolean(error) && <ErrorState error={error} />}
      </section>
    </>
  );
}

function PolicyExample({
  initialPercent,
  balanceDaysBefore,
  fullPaymentWithinDays,
}: {
  initialPercent: number;
  balanceDaysBefore: number;
  fullPaymentWithinDays: number;
}) {
  const today = indiaToday();
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 60);
  const due = new Date(start);
  due.setUTCDate(due.getUTCDate() - balanceDaysBefore);
  const immediate = 60 <= fullPaymentWithinDays;
  return (
    <section className="policy-example">
      <h3>Example for a ₹50,000 booking</h3>
      <p>
        Travel starts {start.toISOString().slice(0, 10)} (60 days from today).
      </p>
      <p>
        {immediate
          ? "The full ₹50,000 is due immediately."
          : `${formatINR(String((50000 * initialPercent) / 100))} initially; the balance of ${formatINR(String((50000 * (100 - initialPercent)) / 100))} is due ${due.toISOString().slice(0, 10)}.`}
      </p>
      <small>
        Illustration only. The saved quote’s agreed schedule determines actual
        payments.
      </small>
    </section>
  );
}
