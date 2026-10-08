import type {
  InvoiceStatus,
  Pagination,
  PaymentStatus,
} from "@/lib/api/contracts";
import type {
  AccountingStatus,
  GatewayOrderStatus,
  PaymentResolution,
  ReceiptStatus,
  ReviewReason,
} from "@/features/payment-review/contracts";

export type CustomerCategory = "AGENT" | "LEISURE" | "CORPORATE";
export type SortOrder = "asc" | "desc";
export type AgeingBucket =
  | "NOT_DUE"
  | "1_30"
  | "31_60"
  | "61_90"
  | "90_PLUS"
  | "NO_DUE_DATE";

export interface ReportMeta {
  currency: "INR";
  dateBasis:
    | "INVOICE_DATE"
    | "RECEIPT_DATE"
    | "PAYMENT_ACTIVITY_IST"
    | "ADJUSTMENT_DATE"
    | "EVENT_TIMESTAMP";
  from: string | null;
  to: string | null;
  balanceBasis: "CURRENT";
  generatedAt: string;
}

export interface ReportEnvelope<Row, Summary> {
  data: Row[];
  summary: Summary;
  pagination: Pagination;
  meta: ReportMeta;
}

export interface InvoiceReportRow {
  invoiceId: string;
  invoiceDate: string;
  financialYear: string | null;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  companyId: string;
  companyName: string;
  customerId: string;
  customerName: string;
  customerCategory: CustomerCategory;
  serviceCategoryId: string;
  serviceCategoryName: string;
  vehicleId: string | null;
  vehicleRegistrationNumber: string | null;
  vehicleName: string | null;
  vehicleType: string | null;
  guestDisplayText: string;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  receivedAmount: string;
  adjustmentAmount: string;
  dueAmount: string;
  paymentStatus: PaymentStatus;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface InvoiceSummary {
  total: number;
  draftCount: number;
  issuedCount: number;
  cancelledCount: number;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  receivedAmount: string;
  adjustmentAmount: string;
  dueAmount: string;
}

export interface VehicleInvoiceRow {
  vehicleId: string | null;
  vehicleRegistrationNumber: string | null;
  vehicleName: string | null;
  vehicleType: string | null;
  invoiceCount: number;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  receivedAmount: string;
  adjustmentAmount: string;
  dueAmount: string;
  firstInvoiceDate: string;
  latestInvoiceDate: string;
}

export interface VehicleInvoiceSummary {
  total: number;
  invoiceCount: number;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  receivedAmount: string;
  adjustmentAmount: string;
  dueAmount: string;
}

export interface TaxReportRow {
  taxId: string;
  invoiceId: string;
  invoiceDate: string;
  invoiceNumber: string | null;
  companyName: string;
  customerName: string;
  customerCategory: CustomerCategory;
  serviceCategoryName: string;
  lineId: string;
  position: number;
  description: string;
  taxableBase: string;
  taxTreatment: string;
  component: "IGST" | "CGST" | "SGST" | "SERVICE_TAX";
  rate: string;
  taxAmount: string;
}

export interface TaxSummary {
  total: number;
  taxableBase: string;
  taxAmount: string;
  breakdown: Array<{
    component: string;
    rate: string;
    serviceCategoryName: string;
    invoiceCount: number;
    taxedLineCount: number;
    taxAmount: string;
  }>;
}

export interface PaymentReportRow {
  id: string;
  source: "MANUAL" | "GATEWAY";
  amount: string;
  activityAt: string;
  reportDate: string;
  receivedDate: string | null;
  paidAt: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  receiptStatus: "PENDING" | "CONFIRMED" | "REVERSED" | null;
  receiptAmount: string | null;
  method: "CASH" | "CHEQUE" | "DD" | "CARD" | "UPI" | "GATEWAY" | null;
  paymentOrderId: string | null;
  gatewayStatus: GatewayPaymentStatus | null;
  needsReview?: boolean;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerStatus: string | null;
  resolutions: Omit<
    PaymentResolution,
    "orderId" | "provider" | "before" | "after"
  >[];
  recordedExternalRefundAmount: string;
  providerConfirmedReviewAmount: string;
  bookingId: string | null;
  bookingReference: string | null;
  attempts: PaymentAttempt[];
  details: {
    reference?: string;
    bankName?: string;
    instrumentDate?: string;
    cardLastFour?: string;
  };
  createdAt: string;
  reversalReason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  companyId: string | null;
  companyName: string | null;
  customerId: string | null;
  customerName: string | null;
  customerCategory: CustomerCategory | null;
  serviceCategoryId: string | null;
  serviceCategoryName: string | null;
}

export type GatewayPaymentStatus = GatewayOrderStatus;

export interface PaymentAttempt {
  id: string;
  reviewReasons: ReviewReason[];
  receiptStatus: ReceiptStatus | null;
  receiptAccountingState: ReceiptStatus | "REVERSED_WITHOUT_REFUND" | null;
  providerPaymentId: string | null;
  status:
    | "NOT_ATTEMPTED"
    | "PENDING"
    | "SUCCESS"
    | "FAILED"
    | "USER_DROPPED"
    | "CANCELLED"
    | "VOID"
    | "UNKNOWN";
  accountingStatus: AccountingStatus;
  amount: string;
  currency: string;
  receiptId: string | null;
  initiatedAt: string;
  completedAt: string | null;
}

export interface PaymentSummary {
  total: number;
  manualCount: number;
  gatewayCount: number;
  confirmedReceiptCount: number;
  confirmedReceiptAmount: string;
  pendingReceiptCount: number;
  pendingReceiptAmount: string;
  reversedReceiptCount: number;
  reversedReceiptAmount: string;
  providerConfirmedReviewAmount: string;
  recordedExternalRefundAmount: string;
  gatewayStatusBreakdown: Array<{
    status: GatewayPaymentStatus;
    count: number;
    amount: string;
  }>;
}

export interface ReceivableReportRow extends InvoiceReportRow {
  daysOverdue: number | null;
  ageingBucket: AgeingBucket;
  latestPaymentDate: string | null;
}

export interface ReceivableSummary {
  total: number;
  grandTotal: string;
  receivedAmount: string;
  adjustmentAmount: string;
  dueAmount: string;
  ageing: Array<{
    ageingBucket: AgeingBucket;
    invoiceCount: number;
    outstandingInvoiceCount: number;
    dueAmount: string;
  }>;
}

export interface SettlementDiscountRow {
  adjustmentId: string;
  date: string;
  amount: string;
  reason: string;
  status: "ACTIVE" | "REVERSED";
  createdBy: string;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  invoiceId: string;
  invoiceDate: string;
  invoiceNumber: string | null;
  invoiceGrandTotal: string;
  companyName: string;
  customerName: string;
  customerCategory: CustomerCategory;
  serviceCategoryName: string;
  currentDueAmount: string;
}

export interface SettlementSummary {
  total: number;
  activeCount: number;
  activeAmount: string;
  reversedCount: number;
  reversedAmount: string;
}

export interface AuditRow {
  id: string;
  actorId: string;
  actorDisplayName?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface CustomerStatementResponse {
  data: {
    customer: { id: string; name: string; category: CustomerCategory };
    entries: Array<{
      date: string;
      type: "INVOICE" | "RECEIPT" | "SETTLEMENT_DISCOUNT";
      documentId: string;
      documentNumber: string | null;
      description: string;
      debit: string;
      cashCredit: string;
      discountCredit: string;
    }>;
    summary: {
      debit: string;
      cashCredit: string;
      discountCredit: string;
      closingBalance: string;
    };
    dates: { from?: string; to?: string };
  };
}

export interface DashboardResponse {
  data: {
    period: { from?: string; to?: string };
    currency: "INR";
    balanceBasis: "CURRENT";
    generatedAt: string;
    cards: {
      issuedInvoiceCount: number;
      invoicedAmount: string;
      taxBilled: string;
      cashReceivedDuringPeriod: string;
      outstandingNow: string;
      settlementDiscountsDuringPeriod: string;
      overdueAmount: string;
      overdueInvoiceCount: number;
      cashCollectionRate: number | null;
      settlementCoverageRate: number | null;
    };
    receivablesAgeing: Array<{
      ageingBucket: AgeingBucket;
      invoiceCount: number;
      outstandingInvoiceCount: number;
      dueAmount: string;
    }>;
    customerCategoryMix: Array<{
      label: CustomerCategory;
      invoiceCount: number;
      amount: string;
    }>;
    serviceCategoryMix: Array<{
      label: string;
      invoiceCount: number;
      amount: string;
    }>;
    topOutstandingCustomers: Array<{
      customerId: string;
      customerName: string;
      customerCategory: CustomerCategory;
      invoiceCount: number;
      dueAmount: string;
      oldestDueDate: string | null;
    }>;
    paymentMethodMix: Array<{
      method: "CASH" | "CHEQUE" | "DD" | "CARD" | "UPI";
      count: number;
      amount: string;
    }>;
    financialTrend: Array<{
      month: string;
      invoicedAmount: string;
      receivedAmount: string;
    }>;
    recentActivity: AuditRow[];
    alerts: {
      paymentsRequiringReview?: number;
      staleDrafts: number;
      receivablesWithoutDueDate: number;
      incompleteCompanies: number;
      hotelRatesExpiringSoon: number;
      staleOutboxEvents: number;
    };
  };
}
