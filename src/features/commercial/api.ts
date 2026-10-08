import { api, getResource, queryString, safeId } from "@/lib/api/client";
import type { Collection, Invoice, Resource } from "@/lib/api/contracts";

import type {
  BillingReview,
  CalculateQuoteRequest,
  CalculateQuoteResponse,
  CreateQuoteRequest,
  EnablePaymentRequest,
  InvoiceDetails,
  Pricing,
  ProposedPlan,
} from "./billing-contracts";

export type BookingStatus =
  | "DRAFT"
  | "QUOTED"
  | "INVOICED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED";
export interface Booking {
  id: string;
  reference: string;
  companyId: string;
  customerId: string;
  serviceCategoryId: string;
  title: string;
  status: BookingStatus;
  serviceStartsOn: string | null;
  serviceEndsOn: string | null;
  invoiceId?: string | null;
  createdAt?: string;
}
export interface BookingListRow extends Booking {
  customerName: string;
  latestQuoteVersion: number | null;
  latestQuoteAcceptedAt: string | null;
  invoiceNumber: string | null;
  receivedAmount: string | null;
  dueAmount: string | null;
}
export type BookingListFilters = {
  q?: string;
  status?: string;
  companyId?: string;
  customerId?: string;
  serviceStartsFrom?: string;
  serviceStartsTo?: string;
  quoteAcceptance?: string;
};
export interface Quote {
  id: string;
  version: number;
  description: string;
  inclusions: string;
  exclusions: string;
  terms: string;
  total: string;
  expiresOn: string | null;
  acceptedAt: string | null;
  createdAt?: string;
  pricing?: Pricing | null;
  proposedPlan?: ProposedPlan | null;
  legacy?: boolean;
}
export interface Milestone {
  id: string;
  label: string;
  amount: string;
  dueOn: string;
  remainingAmount: string;
  status?: string;
  paidAt?: string | null;
}
export interface PaymentOrder {
  id: string;
  provider: string;
  providerOrderId: string;
  amount: string;
  status: string;
  providerPaymentId: string | null;
  paidAt: string | null;
  receiptId: string | null;
}
export interface BookingDetail {
  booking: Booking;
  quotes: Quote[];
  milestones: Milestone[];
  orders: PaymentOrder[];
  invoice: Invoice | null;
}
export interface AvailableInvoice {
  id: string;
  invoiceNumber: string | null;
  financialYear: string | null;
  invoiceDate: string;
  status: string;
  grandTotal: string;
  customerName: string;
  guestName: string;
  label: string | null;
  lineDescription: string | null;
  eligible: boolean;
  unavailableReasons: string[];
}
export interface InvoiceLinkIdentifier {
  invoiceNumber: string;
  financialYear: string;
}
export interface PaymentPolicy {
  companyId: string;
  initialPercent: number;
  balanceDaysBefore: number;
  fullPaymentWithinDays: number;
  updatedAt: string;
}
export interface PickerItem {
  id: string;
  name: string;
  category?: string;
  mobileNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  companyId?: string;
  code?: string;
  requiresVehicle?: boolean;
}

export const commercialApi = {
  list: (
    page: number,
    signal?: AbortSignal,
    filters: BookingListFilters = {},
  ) =>
    api<Collection<BookingListRow>>(
      `/commercial-bookings${queryString({ ...filters, q: filters.q?.trim().slice(0, 200), page, pageSize: 25 })}`,
      { signal },
    ),
  detail: (id: string, signal?: AbortSignal) =>
    getResource<BookingDetail>(`/commercial-bookings/${safeId(id)}`, signal),
  create: (
    body: Pick<
      Booking,
      | "reference"
      | "companyId"
      | "customerId"
      | "serviceCategoryId"
      | "title"
      | "serviceStartsOn"
      | "serviceEndsOn"
    >,
  ) =>
    api<Resource<{ booking: Booking; accessToken: string }>>(
      "/commercial-bookings",
      { method: "POST", body },
    ),
  rotate: (id: string) =>
    api<Resource<{ accessToken: string }>>(
      `/commercial-bookings/${safeId(id)}/rotate-link`,
      { method: "POST" },
    ),
  calculateQuote: (id: string, body: CalculateQuoteRequest) =>
    api<Resource<CalculateQuoteResponse>>(
      `/commercial-bookings/${safeId(id)}/quotes/calculate`,
      { method: "POST", body },
    ),
  quote: (id: string, body: CreateQuoteRequest) =>
    api<Resource<Quote>>(`/commercial-bookings/${safeId(id)}/quotes`, {
      method: "POST",
      body,
    }),
  billingReview: (id: string, body: Partial<InvoiceDetails>) =>
    api<Resource<BillingReview>>(
      `/commercial-bookings/${safeId(id)}/billing-review`,
      { method: "POST", body },
    ),
  enablePayment: (id: string, body: EnablePaymentRequest) =>
    api<Resource<BookingDetail>>(
      `/commercial-bookings/${safeId(id)}/enable-payment`,
      { method: "POST", body },
    ),
  availableInvoices: (
    id: string,
    q: string,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ) =>
    api<Collection<AvailableInvoice>>(
      `/commercial-bookings/${safeId(id)}/available-invoices${queryString({ q, page, pageSize })}`,
      { signal },
    ),
  linkInvoice: (id: string, invoice: InvoiceLinkIdentifier) =>
    api<Resource<BookingDetail>>(`/commercial-bookings/${safeId(id)}/invoice`, {
      method: "POST",
      body: invoice,
    }),
  schedule: (
    id: string,
    body: { milestones?: Array<Pick<Milestone, "label" | "amount" | "dueOn">> },
  ) =>
    api<Resource<Milestone[]>>(`/commercial-bookings/${safeId(id)}/schedule`, {
      method: "POST",
      body,
    }),
  status: (id: string, status: "CONFIRMED" | "CANCELLED" | "COMPLETED") =>
    api<Resource<Booking>>(`/commercial-bookings/${safeId(id)}/status`, {
      method: "POST",
      body: { status },
    }),
  reconcile: (id: string) =>
    api<
      Resource<{
        status: "PAID" | "PENDING" | "REVIEW_REQUIRED" | "REFUNDED";
        receiptId: string | null;
      }>
    >(`/payment-orders/${safeId(id)}/reconcile-by-id`, { method: "POST" }),
  policy: (companyId: string, signal?: AbortSignal) =>
    getResource<PaymentPolicy>(
      `/companies/${safeId(companyId)}/payment-policy`,
      signal,
    ),
  updatePolicy: (
    companyId: string,
    body: Pick<
      PaymentPolicy,
      "initialPercent" | "balanceDaysBefore" | "fullPaymentWithinDays"
    >,
  ) =>
    api<Resource<PaymentPolicy>>(
      `/companies/${safeId(companyId)}/payment-policy`,
      { method: "PUT", body },
    ),
  picker: (resource: string, page: number, q = "", signal?: AbortSignal) =>
    api<{
      data: PickerItem[];
      pagination: { page: number; pageSize: number; total: number };
    }>(
      `/${resource}${queryString({ page, pageSize: 100, status: "ACTIVE", q: q.trim().slice(0, 200) })}`,
      { signal },
    ),
};
