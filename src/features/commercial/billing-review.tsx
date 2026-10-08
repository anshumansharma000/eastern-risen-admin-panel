"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
} from "@/components/ui";
import {
  apiFieldError,
  ApiError,
  getCollection,
  getResource,
  safeId,
} from "@/lib/api/client";
import type {
  CoreMaster,
  Resource,
  ServiceCategory,
  Vehicle,
} from "@/lib/api/contracts";
import {
  commercialApi,
  type Booking,
  type BookingDetail,
  type Quote,
} from "./api";
import type {
  BillingReview,
  EnablePaymentRequest,
  InvoiceDetails,
} from "./billing-contracts";
import { QuoteBreakdown } from "./quote-breakdown";
import { MasterPicker } from "./picker";
import { RecordChecks } from "@/components/record-select";
import { billingGuidance, uncertainEnablement } from "./billing-errors";

const detailKeys = [
  "invoiceDate",
  "guestDisplayText",
  "serviceProvidedAt",
  "placeOfSupplyState",
  "placeOfSupplyCountry",
  "bankAccountIds",
  "guestId",
  "passengerCount",
  "vehicleId",
  "dueDate",
  "label",
] as const;
const labels: Record<keyof InvoiceDetails, string> = {
  invoiceDate: "Invoice date",
  guestDisplayText: "Traveller / group display text",
  serviceProvidedAt: "Service provided at",
  placeOfSupplyState: "Place of supply — state",
  placeOfSupplyCountry: "Place of supply — country",
  bankAccountIds: "Bank accounts",
  guestId: "Linked guest",
  passengerCount: "Passenger count",
  vehicleId: "Vehicle",
  dueDate: "Invoice due date",
  label: "Internal label",
};
function onlyDetails(
  fields: BillingReview["invoiceFields"],
): Partial<InvoiceDetails> {
  return Object.fromEntries(
    detailKeys
      .filter((k) => fields[k] !== undefined)
      .map((k) => [k, fields[k]]),
  );
}
async function allOptions<T>(resource: string, signal: AbortSignal) {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const result = await getCollection<T>(
      `/${resource}?page=${page}&pageSize=100&status=ACTIVE`,
      signal,
    );
    items.push(...result.data);
    if (
      page * result.pagination.pageSize >= result.pagination.total ||
      !result.data.length
    )
      return items;
    page++;
  }
}

export function BillingReviewPanel({
  booking,
  quote,
  onClose,
  onEnabled,
  onRefresh,
}: {
  booking: Booking;
  quote: Quote;
  onClose: () => void;
  onEnabled: (result: Resource<BookingDetail>) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [details, setDetails] = useState<Partial<InvoiceDetails>>({});
  const [review, setReview] = useState<BillingReview | null>(null);
  const [approved, setApproved] = useState<EnablePaymentRequest | null>(null);
  const [captured, setCaptured] = useState<EnablePaymentRequest | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const banks = useQuery({
    queryKey: ["billing-banks", booking.companyId],
    queryFn: ({ signal }) => allOptions<CoreMaster>("bank-accounts", signal),
  });
  const vehicles = useQuery({
    queryKey: ["billing-vehicles"],
    queryFn: ({ signal }) => allOptions<Vehicle>("vehicles", signal),
  });
  const category = useQuery({
    queryKey: ["service-categories", booking.serviceCategoryId],
    queryFn: ({ signal }) =>
      getResource<ServiceCategory>(
        `/service-categories/${safeId(booking.serviceCategoryId)}`,
        signal,
      ),
  });
  const company = useQuery({
    queryKey: ["companies", booking.companyId],
    queryFn: ({ signal }) =>
      getResource<CoreMaster>(
        `/companies/${safeId(booking.companyId)}`,
        signal,
      ),
  });
  const customer = useQuery({
    queryKey: ["customers", booking.customerId],
    queryFn: ({ signal }) =>
      getResource<CoreMaster>(
        `/customers/${safeId(booking.customerId)}`,
        signal,
      ),
  });
  useEffect(() => {
    const ticket = ++generation.current;
    commercialApi
      .billingReview(booking.id, {})
      .then((r) => {
        if (ticket !== generation.current) return;
        if (
          r.data.quoteId !== quote.id ||
          r.data.quoteVersion !== quote.version
        ) {
          throw new ApiError(
            409,
            "QUOTE_VERSION_CHANGED",
            "The accepted quote changed. Reload the booking and review its current terms.",
          );
        }
        setReview(r.data);
        setDetails({
          ...onlyDetails(r.data.invoiceFields),
          bankAccountIds: r.data.invoiceFields.bankAccountIds ?? [],
        });
        setLoading(false);
      })
      .catch((e) => {
        if (ticket === generation.current) {
          setError(e);
          setLoading(false);
        }
      });
    const requests = generation;
    return () => {
      requests.current++;
    };
  }, [booking.id, quote.id, quote.version]);
  function edit<K extends keyof InvoiceDetails>(
    key: K,
    value: InvoiceDetails[K] | undefined,
  ) {
    generation.current++;
    setApproved(null);
    setLoading(false);
    setError(null);
    setDetails((old) => {
      const next = { ...old };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }
  async function runReview() {
    const ticket = ++generation.current;
    const body = structuredClone(details);
    setLoading(true);
    setApproved(null);
    setError(null);
    try {
      const r = await commercialApi.billingReview(booking.id, body);
      if (ticket !== generation.current) return;
      if (
        r.data.quoteId !== quote.id ||
        r.data.quoteVersion !== quote.version
      ) {
        throw new ApiError(
          409,
          "QUOTE_VERSION_CHANGED",
          "The accepted quote changed. Reload the booking and review its current terms.",
        );
      }
      setReview(r.data);
      if (r.data.eligible && r.data.reviewToken && r.data.quoteId)
        setApproved({
          quoteId: r.data.quoteId,
          reviewToken: r.data.reviewToken,
          invoiceDetails: body as InvoiceDetails,
        });
    } catch (e) {
      if (ticket === generation.current) setError(e);
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  async function enable(payload: EnablePaymentRequest) {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    setCaptured(payload);
    try {
      const result = await commercialApi.enablePayment(booking.id, payload);
      setUncertain(false);
      setCaptured(null);
      setApproved(null);
      await onEnabled(result);
    } catch (e) {
      setError(e);
      if (uncertainEnablement(e)) {
        setUncertain(true);
        await onRefresh().catch(() => {});
      } else {
        setUncertain(false);
        setCaptured(null);
        setApproved(null);
        await onRefresh().catch(() => {});
      }
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  const mastersLoading =
    banks.isPending ||
    vehicles.isPending ||
    category.isPending ||
    company.isPending ||
    customer.isPending;
  const masterError =
    banks.error ||
    vehicles.error ||
    category.error ||
    company.error ||
    customer.error;
  const bankOptions = (banks.data ?? []).filter(
    (b) => b.companyId === booking.companyId && b.status === "ACTIVE",
  );
  const lastDate = review?.proposedPlan?.milestones
    .map((m) => m.dueOn)
    .sort()
    .at(-1);
  const requiresVehicle = category.data?.data.requiresVehicle === true;
  return (
    <Modal
      protectChanges={false}
      closeDisabled={submitting || uncertain}
      title="Review invoice and enable payment"
      subtitle={booking.title}
      onClose={() => {
        if (!submitting && !uncertain) onClose();
      }}
    >
      <div className="billing-review-content">
        <p>
          Issue the invoice and activate the agreed payment schedule together.
          Booking confirmation remains a separate admin action after the initial
          payment is received.
        </p>
        {loading && <Loading label="Reviewing billing details" />}
        {mastersLoading && <Loading label="Loading invoice options" />}
        {masterError && (
          <ErrorState
            error={masterError}
            onRetry={() => {
              void banks.refetch();
              void vehicles.refetch();
              void category.refetch();
              void company.refetch();
              void customer.refetch();
            }}
          />
        )}
        {review && (
          <>
            <h3>Accepted quote · Version {review.quoteVersion}</h3>
            <p>{quote.description}</p>
            <p>Inclusions: {quote.inclusions || "—"}</p>
            <p>Exclusions: {quote.exclusions || "—"}</p>
            <p>Terms: {quote.terms}</p>
            <p>
              Company: {String(company.data?.data.name ?? "Loading…")} ·
              Customer: {String(customer.data?.data.name ?? "Loading…")} ·
              Service: {category.data?.data.name ?? "Loading…"}
            </p>
            <QuoteBreakdown
              pricing={review.pricing}
              plan={review.proposedPlan}
            />
            <p>
              Prices, scope, taxes and payment dates are fixed by the accepted
              quote.
            </p>
            {review.missingFields.length > 0 && (
              <p role="status">
                Required:{" "}
                {review.missingFields.map((k) => labels[k]).join(", ")}
              </p>
            )}
            {review.errors.length > 0 && (
              <div className="error-panel" role="alert">
                {review.errors.map((e, i) => (
                  <p key={i}>{e.message}</p>
                ))}
              </div>
            )}
          </>
        )}
        <fieldset
          className="billing-fieldset"
          disabled={
            submitting || uncertain || mastersLoading || Boolean(masterError)
          }
        >
          <h3>Invoice details</h3>
          <div className="form-grid">
            {(
              [
                "invoiceDate",
                "guestDisplayText",
                "serviceProvidedAt",
                "placeOfSupplyState",
                "placeOfSupplyCountry",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={labels[key]}
                error={apiFieldError(error, key)}
              >
                <Input
                  type={key === "invoiceDate" ? "date" : "text"}
                  required
                  value={details[key] ?? ""}
                  onChange={(e) => edit(key, e.target.value)}
                />
              </Field>
            ))}
            <MasterPicker
              resource="guests"
              label="Linked guest (optional)"
              required={false}
              value={details.guestId ?? ""}
              onChange={(id) => edit("guestId", id || undefined)}
            />
            <Field label="Passenger count">
              <Input
                type="number"
                min={1}
                max={100000}
                value={details.passengerCount ?? ""}
                onChange={(e) =>
                  edit(
                    "passengerCount",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field
              label={
                requiresVehicle ? "Vehicle (required)" : "Vehicle (optional)"
              }
              error={apiFieldError(error, "vehicleId")}
            >
              <Select
                value={details.vehicleId ?? ""}
                onChange={(e) => edit("vehicleId", e.target.value || undefined)}
              >
                <option value="">Select vehicle</option>
                {(vehicles.data ?? [])
                  .filter((v) => v.status === "ACTIVE")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationNumber} · {v.displayName}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label="Invoice due date (optional)"
              hint={`If specified, it must equal the final agreed payment date${lastDate ? ` (${lastDate})` : ""} and be on or after the invoice date. Leave blank for an entirely overdue plan.`}
              error={apiFieldError(error, "dueDate")}
            >
              <Input
                type="date"
                aria-label="Invoice due date (optional)"
                value={details.dueDate ?? ""}
                onChange={(e) => edit("dueDate", e.target.value || undefined)}
              />
            </Field>
            <Field label="Internal label">
              <Input
                value={details.label ?? ""}
                onChange={(e) => edit("label", e.target.value || undefined)}
              />
            </Field>
            <RecordChecks
              label="Bank accounts"
              name="bankAccountIds"
              max={10}
              value={details.bankAccountIds ?? []}
              onChange={(values) => edit("bankAccountIds", values)}
              options={bankOptions.map((bank) => ({
                id: bank.id,
                label: `${bank.name} · ${bank.accountNumber ?? ""}`,
              }))}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={runReview}
          >
            Review invoice details
          </Button>
          {approved && (
            <p role="status">
              Review complete. The invoice and payment schedule are ready to
              activate.
            </p>
          )}
          {!approved && !loading && (
            <p id="payment-review-help" role="status">
              After filling or changing invoice details, click “Review invoice
              details”. Enable payment becomes available when the review passes.
              Resolve any required fields or errors shown above, then review
              again.
            </p>
          )}
          <Button
            type="button"
            disabled={!approved || loading}
            aria-describedby={
              !approved && !loading ? "payment-review-help" : undefined
            }
            onClick={() => {
              if (approved) void enable(approved);
            }}
          >
            {submitting ? "Enabling payment…" : "Enable payment"}
          </Button>
        </fieldset>
        {Boolean(error) && (
          <ErrorState
            error={error}
            onRetry={
              !uncertain && !submitting ? () => void onRefresh() : undefined
            }
          />
        )}
        {billingGuidance(error) && (
          <p role="status">{billingGuidance(error)}</p>
        )}
        {uncertain && (
          <div role="status">
            <p>
              The result has not been confirmed. We’re checking the booking.
              Retry the same request if payment is still not enabled; keep this
              review open until the outcome is known.
            </p>
            <Button
              disabled={submitting || !captured}
              onClick={() => {
                if (captured) void enable(captured);
              }}
            >
              Retry same payment enablement
            </Button>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() => void onRefresh()}
            >
              Check booking status
            </Button>
          </div>
        )}
        <Button
          variant="secondary"
          disabled={submitting || uncertain}
          onClick={onClose}
        >
          Close review
        </Button>
      </div>
    </Modal>
  );
}
