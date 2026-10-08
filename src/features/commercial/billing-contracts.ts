export type TaxTreatment = "TAXABLE" | "NON_TAXABLE" | "EXEMPT" | "NIL_RATED";
export type TaxComponent = "IGST" | "CGST" | "SGST" | "SERVICE_TAX";
export interface ServiceLine {
  description: string;
  amount: string;
  taxTreatment: TaxTreatment;
  taxComponents: TaxComponent[];
}
export interface Pricing {
  lines: {
    position: number;
    description: string;
    amount: string;
    taxTreatment: TaxTreatment;
    taxes: {
      ruleId: string;
      component: TaxComponent;
      rate: string;
      amount: string;
    }[];
    taxAmount: string;
    total: string;
  }[];
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  taxEffectiveDate: string;
  currency: "INR";
  rounding: "HALF_UP_PER_LINE_COMPONENT";
}
export interface ProposedMilestone {
  label: string;
  amount: string;
  dueOn: string;
}
export type PaymentPlanInput =
  | { mode: "COMPANY_DEFAULT" }
  | { mode: "CUSTOM"; milestones: ProposedMilestone[] };
export interface ProposedPlan {
  mode: "COMPANY_DEFAULT" | "CUSTOM";
  milestones: ProposedMilestone[];
  policy: {
    initialPercent: number;
    balanceDaysBefore: number;
    fullPaymentWithinDays: number;
  } | null;
  resolvedOn: string;
  overdueRule: "KEEP_ACCEPTED_DATES";
}
export interface CalculateQuoteRequest {
  lines: ServiceLine[];
  taxEffectiveDate: string;
  paymentPlan: PaymentPlanInput;
}
export interface CalculateQuoteResponse {
  pricing: Pricing;
  proposedPlan: ProposedPlan;
}
export interface QuoteScope {
  description: string;
  inclusions: string;
  exclusions: string;
  terms: string;
  expiresOn?: string | null;
}
export type CreateQuoteRequest = QuoteScope &
  (CalculateQuoteRequest | { total: string });
export interface InvoiceDetails {
  invoiceDate: string;
  guestDisplayText: string;
  serviceProvidedAt: string;
  placeOfSupplyState: string;
  placeOfSupplyCountry: string;
  bankAccountIds: string[];
  guestId?: string | null;
  passengerCount?: number | null;
  vehicleId?: string | null;
  dueDate?: string | null;
  label?: string | null;
}
export interface BillingReview {
  bookingId: string;
  quoteId: string | null;
  quoteVersion: number | null;
  invoiceFields: Partial<InvoiceDetails> & {
    companyId: string;
    customerId: string;
    serviceCategoryId: string;
    lines: ServiceLine[];
  };
  pricing: Pricing | null;
  proposedPlan: ProposedPlan | null;
  missingFields: (keyof InvoiceDetails)[];
  errors: { code: string; message: string }[];
  eligible: boolean;
  reviewToken: string | null;
}
export interface EnablePaymentRequest {
  quoteId: string;
  reviewToken: string;
  invoiceDetails: InvoiceDetails;
}
