import { ApiError } from "@/lib/api/client";
const guidance: Record<string, string> = {
  PAYMENT_PLAN_PREREQUISITES_MISSING:
    "Company default requires a service start date. Choose a custom payment plan.",
  QUOTE_VERSION_CHANGED:
    "Reload the booking and review the latest accepted quote. Do not enable payment against superseded terms.",
  QUOTE_NOT_ACCEPTED:
    "The customer must accept the latest quote before payment can be enabled.",
  LEGACY_QUOTE_REQUIRES_REVISION:
    "Continue manual billing, or create a structured revision and obtain fresh customer acceptance.",
  LEGACY_BILLING_CONFLICT:
    "This booking already uses manual billing. Continue with its existing invoice and schedule; do not recreate them.",
  QUOTE_PRICING_REVIEW_REQUIRED:
    "Invoice calculation differs from the agreed pricing. Resolve the pricing configuration or prepare a revised quote for fresh acceptance.",
  AGREED_PAYMENT_TERMS_CHANGED:
    "Restore the accepted payment terms or prepare a revised quote for fresh acceptance.",
  STALE_BILLING_REVIEW:
    "Booking or billing details changed. Reload and review the current details before enabling payment again.",
  IDEMPOTENCY_CONFLICT:
    "Another payment enablement request has already succeeded. Reload the booking to view its existing invoice and schedule.",
  BOOKING_ALREADY_INVOICED:
    "Reload the booking and continue with its existing invoice.",
  SCHEDULE_ALREADY_SET:
    "Reload the booking and continue with its existing schedule.",
  BOOKING_NOT_INVOICEABLE:
    "Reload the booking and check its current status before continuing.",
};
export function billingGuidance(error: unknown) {
  return error instanceof ApiError ? guidance[error.code] : undefined;
}
export function uncertainEnablement(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status >= 500 ||
    error.code === "UNEXPECTED_RESPONSE"
  );
}
