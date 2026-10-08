import type { ResolutionAction, ReviewReasonCode } from "./contracts";

export const actionLabels: Record<ResolutionAction, string> = {
  APPLY_TO_LINKED_INVOICE: "Apply to linked invoice",
  LINK_EXISTING_RECEIPT: "Link existing receipt",
  RECORD_VERIFIED_EXTERNAL_REFUND: "Record a completed external refund",
};
export const reasonLabels: Record<ReviewReasonCode, string> = {
  AMOUNT_MISMATCH: "The received amount differs from the order amount.",
  CURRENCY_MISMATCH: "The payment currency is not INR.",
  ADDITIONAL_SUCCESS: "An additional successful payment was received.",
  ORDER_ALREADY_UNDER_REVIEW:
    "Another payment arrived while this order was under review.",
  BOOKING_MISSING: "The associated booking was not found.",
  BOOKING_INELIGIBLE: "The booking could not collect this payment.",
  INVOICE_MISSING: "No invoice was linked.",
  INVOICE_NOT_ISSUED: "The invoice was not issued for collection.",
  OVERPAYMENT: "The payment exceeded the available invoice balance.",
  RECEIPT_VALIDATION_FAILED: "Receipt creation failed validation.",
  RECEIPT_IDEMPOTENCY_CONFLICT:
    "The existing gateway receipt identity conflicted with creation.",
  RECEIPT_NOT_CONFIRMED: "The existing gateway receipt was not confirmed.",
  UNKNOWN_LEGACY_REASON: "The original reason was not recorded.",
};
export const blockerLabels: Record<string, string> = {
  ALREADY_RESOLVED: "A terminal decision has already been recorded.",
  PAYMENT_NOT_VERIFIED: "The provider has not verified a successful payment.",
  ZERO_AMOUNT: "A zero amount cannot be applied or refunded.",
  ATTEMPT_NOT_REVIEWABLE:
    "This attempt is not currently eligible for resolution.",
  CURRENCY_NOT_INR: "Only INR payments can be applied to an INR invoice.",
  INVOICE_MISSING: "No invoice is currently linked.",
  BOOKING_INELIGIBLE: "The booking is currently ineligible for collection.",
  INVOICE_NOT_ISSUED: "The current invoice is not issued.",
  INVOICE_IDENTITY_MISMATCH:
    "The invoice's company, customer or service does not match.",
  ORDER_ALREADY_HAS_RECEIPT: "The order already has an applied receipt.",
  ADDITIONAL_SUCCESS: "An additional payment cannot be applied to this order.",
  OTHER_UNRESOLVED_SUCCESS:
    "Another successful payment still requires resolution.",
  OVERPAYMENT: "The current invoice balance is insufficient.",
  EXISTING_MATCHING_RECEIPT_USE_LINK:
    "Link the existing matching receipt instead of creating another.",
  EXISTING_RECEIPT_CONFLICT:
    "An existing receipt conflicts with this decision.",
  NO_MATCHING_AUTHORITATIVE_RECEIPT:
    "The backend found no eligible matching receipt.",
  RECEIPT_NOT_REVERSED:
    "An identified receipt is still pending or confirmed; refund recording is blocked.",
};
export const conflictLabels: Record<string, string> = {
  PAYMENT_REVIEW_STALE:
    "The payment or invoice changed. The case has been refreshed. Select an action and confirm a new decision.",
  PAYMENT_ALREADY_RESOLVED:
    "This payment already has a recorded decision. Review the resolution history below.",
  PAYMENT_RESOLUTION_IDEMPOTENCY_CONFLICT:
    "This submission key conflicts with an existing decision. The captured decision is locked; inspect the refreshed case before explicitly starting again.",
  PAYMENT_RESOLUTION_NOT_ALLOWED:
    "This action is no longer allowed. Inspect the refreshed blockers before deciding again.",
  PAYMENT_RECEIPT_EVIDENCE_INVALID:
    "The selected receipt is no longer an eligible match. Refresh and select a backend matching receipt.",
  PAYMENT_RECEIPT_NOT_CONFIRMED:
    "The selected receipt is not confirmed. Refresh the case before deciding again.",
  PAYMENT_REFUND_MUST_BE_COMPLETE:
    "Only the exact full payment amount and currency can be recorded as refunded.",
  PAYMENT_REFUND_REFERENCE_USED:
    "This refund reference is already attributed to another decision.",
};
