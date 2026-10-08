export type CoreRole = "CORE_ADMIN" | "CORE_DATA_ENTRY" | "CORE_REPORT_VIEWER";
export type CoreStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type CatalogStatus = "ACTIVE" | "DEACTIVATED" | "ARCHIVED";
export type InvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED";
export type PaymentStatus =
  | "NOT_APPLICABLE"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID";

export interface Principal {
  accountId: string;
  role: CoreRole | "ADMIN" | "DRIVER";
  displayName: string;
  driverId: string | null;
}

export interface AuthSession {
  user: Principal;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}
export interface Collection<T> {
  data: T[];
  pagination: Pagination;
}
export interface Resource<T> {
  data: T;
}
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    developerMessage?: string;
    details?: {
      fields?: Array<{ field: string; message: string; rule?: string }>;
    };
    requestId?: string;
  };
}

export interface CoreMaster {
  id: string;
  status: CoreStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface InvoiceLine {
  id?: string;
  position: number;
  description: string;
  amount: string;
  taxTreatment: "TAXABLE" | "NON_TAXABLE" | "EXEMPT" | "NIL_RATED";
  taxAmount: string;
  total: string;
  appliedTaxes?: Array<{
    component: string;
    rate: string;
    amount: string;
    ruleId: string | null;
  }>;
}

export interface VehicleSnapshot {
  id: string;
  name: string;
  registrationNumber: string;
  vehicleType: string;
}

export interface InvoiceSnapshot {
  vehicle?: VehicleSnapshot | null;
  [key: string]: unknown;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  receivedDate: string;
  amount: string;
  method: "CASH" | "CHEQUE" | "DD" | "CARD" | "UPI";
  status: "PENDING" | "CONFIRMED" | "REVERSED";
  details: Record<string, string>;
  reversalReason?: string | null;
}

export interface Adjustment {
  id: string;
  amount: string;
  reason: string;
  date: string;
  reversedAt?: string | null;
  reversalReason?: string | null;
}

export interface Invoice {
  id: string;
  version: number;
  status: InvoiceStatus;
  invoiceNumber: string | null;
  companyId: string;
  customerId: string;
  guestId?: string | null;
  guestDisplayText: string;
  passengerCount?: number | null;
  serviceCategoryId: string;
  vehicleId?: string | null;
  details?: {
    vehicleId?: string | null;
    [key: string]: unknown;
  };
  invoiceDate: string;
  dueDate?: string | null;
  serviceProvidedAt: string;
  placeOfSupplyState: string;
  placeOfSupplyCountry: string;
  label?: string | null;
  bankAccountIds?: string[];
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  paymentStatus?: PaymentStatus;
  receivedAmount?: string;
  adjustmentAmount?: string;
  dueAmount?: string;
  lines?: InvoiceLine[];
  receipts?: Receipt[];
  settlementAdjustments?: Adjustment[];
  snapshot?: InvoiceSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface Receivable {
  invoiceId: string;
  invoiceNumber: string;
  companyId: string;
  customerId: string;
  invoiceDate: string;
  grandTotal: string;
  receivedAmount: string;
  adjustmentAmount: string;
  dueAmount: string;
}

export interface CoreUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: CoreRole;
  status: "ACTIVE" | "DEACTIVATED" | "ARCHIVED";
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  displayName: string;
  vehicleType: string;
  registeredOwner: string | null;
  address: string | null;
  contactNumber: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ServiceCategory extends CoreMaster {
  name: string;
  code: string;
  requiresVehicle: boolean;
}

export interface CoreProfile {
  accountId: string;
  username: string;
  displayName: string;
  email: string;
  role: CoreRole;
  status: "ACTIVE" | "DEACTIVATED" | "ARCHIVED";
  passwordChangedAt: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
