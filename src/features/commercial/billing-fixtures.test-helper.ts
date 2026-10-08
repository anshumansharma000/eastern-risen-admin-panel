import type {
  BillingReview,
  CalculateQuoteResponse,
  InvoiceDetails,
} from "./billing-contracts";
import type { Booking, Quote } from "./api";
export const billingBooking: Booking = {
  id: "booking",
  reference: "R",
  title: "Tour",
  companyId: "company",
  customerId: "customer",
  serviceCategoryId: "category",
  status: "QUOTED",
  serviceStartsOn: "2027-01-01",
  serviceEndsOn: null,
};
export const calculated: CalculateQuoteResponse = {
  pricing: {
    lines: [
      {
        position: 1,
        description: "Transport",
        amount: "100.00",
        taxTreatment: "TAXABLE",
        taxes: [
          { ruleId: "gst", component: "IGST", rate: "5", amount: "5.00" },
        ],
        taxAmount: "5.00",
        total: "105.00",
      },
    ],
    subtotal: "100.00",
    taxTotal: "5.00",
    grandTotal: "105.00",
    taxEffectiveDate: "2026-10-07",
    currency: "INR",
    rounding: "HALF_UP_PER_LINE_COMPONENT",
  },
  proposedPlan: {
    mode: "COMPANY_DEFAULT",
    milestones: [
      { label: "Initial payment", amount: "105.00", dueOn: "2020-01-01" },
    ],
    policy: {
      initialPercent: 30,
      balanceDaysBefore: 30,
      fullPaymentWithinDays: 30,
    },
    resolvedOn: "2026-10-07",
    overdueRule: "KEEP_ACCEPTED_DATES",
  },
};
export const acceptedQuote: Quote = {
  id: "quote",
  version: 2,
  description: "Transport",
  inclusions: "Driver",
  exclusions: "Meals",
  terms: "Pay according to the plan",
  total: "105.00",
  expiresOn: "2020-01-01",
  acceptedAt: "2020-01-01T00:00:00Z",
  pricing: calculated.pricing,
  proposedPlan: calculated.proposedPlan,
  legacy: false,
};
export const invoiceDetails: InvoiceDetails = {
  invoiceDate: "2026-10-07",
  guestDisplayText: "Tour group",
  serviceProvidedAt: "ODISHA",
  placeOfSupplyState: "ODISHA",
  placeOfSupplyCountry: "INDIA",
  bankAccountIds: [],
};
export const eligibleReview: BillingReview = {
  bookingId: "booking",
  quoteId: "quote",
  quoteVersion: 2,
  invoiceFields: {
    companyId: "company",
    customerId: "customer",
    serviceCategoryId: "category",
    lines: [
      {
        description: "Transport",
        amount: "100.00",
        taxTreatment: "TAXABLE",
        taxComponents: ["IGST"],
      },
    ],
    ...invoiceDetails,
  },
  ...calculated,
  missingFields: [],
  errors: [],
  eligible: true,
  reviewToken: "opaque-review-token",
};
