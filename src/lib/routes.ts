export type RecordView =
  | "inquiry-detail"
  | "invoice-detail"
  | "invoice-edit"
  | "commercial-detail"
  | "customer-statement"
  | "guest-activity";

export const recordRoutes: Record<
  RecordView,
  { path: string; register: string }
> = {
  "inquiry-detail": { path: "/inquiries/detail", register: "/inquiries" },
  "invoice-detail": { path: "/invoices/detail", register: "/invoices" },
  "invoice-edit": { path: "/invoices/edit", register: "/invoices" },
  "commercial-detail": {
    path: "/commercial-bookings/detail",
    register: "/commercial-bookings",
  },
  "customer-statement": {
    path: "/customers/statement",
    register: "/customers",
  },
  "guest-activity": { path: "/guests/activity", register: "/guests" },
};

export function recordHref(view: RecordView, id: string) {
  return `${recordRoutes[view].path}?id=${encodeURIComponent(id)}`;
}

// Called from effects and event handlers, where the browser has the full URL.
export function loginHref(pathname: string) {
  const query = typeof window === "undefined" ? "" : window.location.search;
  return `/login?returnTo=${encodeURIComponent(pathname + query)}`;
}
