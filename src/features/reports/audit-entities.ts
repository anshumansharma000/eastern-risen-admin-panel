import { recordHref } from "@/lib/routes";
import { getResource, safeId } from "@/lib/api/client";
import type { CoreUser } from "@/lib/api/contracts";
import { resolveAuditActor } from "./audit-actors";
import { humanize } from "./report-shared";
import type { AuditRow } from "./contracts";

type RecordData = Record<string, unknown>;
export type AuditEntity = {
  label: string;
  context: string;
  href?: string;
  linkLabel?: string;
};
const masters: Record<string, string> = {
  CUSTOMER: "customers",
  GUEST: "guests",
  HOTEL: "hotels",
  HOTEL_RATE: "hotel-rates",
  VENDOR: "vendors",
  VENDOR_PROFILE: "vendor-profiles",
  VEHICLE: "vehicles",
  COMPANY: "companies",
  BANK_ACCOUNT: "bank-accounts",
  SERVICE_CATEGORY: "service-categories",
  TAX_RULE: "tax-rules",
};
const registerRoutes: Record<string, string> = {
  companies: "/configuration/companies",
  "tax-rules": "/configuration/taxes",
};
export const auditEntityType = (value: string) =>
  value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[ -]/g, "_")
    .toUpperCase();
export function canResolveAuditEntity(row: AuditRow) {
  const type = auditEntityType(row.entityType);
  return Boolean(
    row.entityId &&
      (masters[type] ||
        ["INVOICE", "COMMERCIAL_BOOKING", "PAYMENT_ORDER"].includes(type)),
  );
}
function object(value: unknown): RecordData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordData)
    : {};
}
function text(record: RecordData, key: string) {
  return typeof record[key] === "string" ? (record[key] as string).trim() : "";
}
export function staffAuditEntity(
  row: AuditRow,
  users: readonly CoreUser[],
): AuditEntity | undefined {
  if (!["USER", "CORE_USER"].includes(auditEntityType(row.entityType))) return;
  const actor = resolveAuditActor(
    {
      ...row,
      actorId: row.entityId,
      actorDisplayName: undefined,
      actorRole: undefined,
    },
    users,
  );
  return actor.resolved
    ? {
        label: actor.name,
        context: actor.details,
        href: "/users",
        linkLabel: "Open staff register",
      }
    : undefined;
}
export async function loadAuditEntity(
  row: AuditRow,
  signal: AbortSignal,
): Promise<AuditEntity> {
  const type = auditEntityType(row.entityType),
    id = safeId(row.entityId);
  let path: string;
  if (type === "INVOICE") path = `/invoices/${id}`;
  else if (type === "COMMERCIAL_BOOKING") path = `/commercial-bookings/${id}`;
  else if (type === "PAYMENT_ORDER") path = `/payment-orders/${id}/review`;
  else if (masters[type]) path = `/${masters[type]}/${id}`;
  else throw new Error("Record details are not available for this type.");
  const response = await getResource<RecordData>(path, signal);
  const record = object(response.data);
  if (!Object.keys(record).length)
    throw new Error("Record details are unavailable.");
  if (type === "INVOICE") {
    const customer = text(object(object(record.snapshot).customer), "name");
    return {
      label:
        text(record, "invoiceNumber") ||
        (text(record, "status") === "DRAFT" ? "Draft invoice" : "Invoice"),
      context: [
        customer && `Customer: ${customer}`,
        text(record, "invoiceDate"),
      ]
        .filter(Boolean)
        .join(" · "),
      href: recordHref("invoice-detail", row.entityId),
      linkLabel: "Open invoice",
    };
  }
  if (type === "COMMERCIAL_BOOKING") {
    const booking = object(record.booking);
    return {
      label: text(booking, "reference") || "Booking",
      context: text(booking, "title"),
      href: recordHref("commercial-detail", row.entityId),
      linkLabel: "Open booking",
    };
  }
  if (type === "PAYMENT_ORDER") {
    const order = object(record.order),
      booking = object(record.booking),
      customer = object(record.customer);
    const reference = text(order, "providerOrderId");
    return {
      label: reference || "Payment order",
      context: [text(booking, "reference"), text(customer, "name")]
        .filter(Boolean)
        .join(" · "),
      href: reference
        ? `/reports/payments-received?source=GATEWAY&q=${encodeURIComponent(reference)}`
        : undefined,
      linkLabel: "Find payment",
    };
  }
  const resource = masters[type];
  let label = text(record, "name"),
    context = "";
  if (type === "VEHICLE") {
    label = text(record, "registrationNumber") || text(record, "displayName");
    context = text(record, "displayName");
  }
  if (type === "HOTEL") context = text(record, "city");
  if (type === "HOTEL_RATE") context = text(record, "plan");
  if (type === "BANK_ACCOUNT") context = text(record, "bankName");
  if (type === "SERVICE_CATEGORY") context = text(record, "code");
  if (type === "TAX_RULE") context = text(record, "component");
  if (type === "VENDOR_PROFILE") {
    context = [
      text(record, "city"),
      text(record, "state"),
      text(record, "country"),
    ]
      .filter(Boolean)
      .join(", ");
    const vendorId = text(record, "vendorId");
    if (vendorId) {
      try {
        const vendor = await getResource<RecordData>(
          `/vendors/${safeId(vendorId)}`,
          signal,
        );
        label = text(object(vendor.data), "name");
      } catch {
        signal.throwIfAborted();
      }
    }
    label ||= context || "Vendor profile";
  }
  if (!label) throw new Error("Record name is unavailable.");
  return {
    label,
    context,
    href:
      type === "CUSTOMER"
        ? recordHref("customer-statement", row.entityId)
        : type === "GUEST"
          ? recordHref("guest-activity", row.entityId)
          : registerRoutes[resource] || `/${resource}`,
    linkLabel:
      type === "CUSTOMER"
        ? "Open customer statement"
        : type === "GUEST"
          ? "Open guest activity"
          : `Open ${humanize(resource.replaceAll("-", "_")).toLowerCase()} register`,
  };
}
