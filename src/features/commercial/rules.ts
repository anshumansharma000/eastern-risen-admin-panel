import type { BookingDetail, Milestone } from "./api";
import { moneyToPaise, normalizeMoney } from "@/lib/money";

export function latestAccepted(detail: BookingDetail) {
  return (
    [...detail.quotes].sort((a, b) => b.version - a.version)[0]?.acceptedAt ??
    null
  );
}
export function scheduleError(
  milestones: Array<Pick<Milestone, "label" | "amount" | "dueOn">>,
  grandTotal: string,
  today: string,
) {
  if (milestones.length < 1 || milestones.length > 12)
    return "Use 1 to 12 milestones.";
  if (
    milestones.some(
      (m) =>
        !m.label.trim() ||
        !m.dueOn ||
        m.dueOn < today ||
        !normalizeMoney(m.amount) ||
        moneyToPaise(m.amount) <= 0n,
    )
  )
    return "Every milestone needs a label, a positive amount, and an India-local due date today or later.";
  if (
    milestones.reduce((sum, m) => sum + moneyToPaise(m.amount), 0n) !==
    moneyToPaise(grandTotal)
  )
    return "Milestone amounts must exactly equal the invoice grand total.";
  return null;
}
export function statusReason(
  detail: BookingDetail,
  target: "CONFIRMED" | "CANCELLED" | "COMPLETED",
) {
  const { booking, invoice, milestones } = detail;
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED")
    return "This booking is closed.";
  if (target === "COMPLETED")
    return booking.status === "CONFIRMED" ? null : "Confirm the booking first.";
  if (target === "CANCELLED") return null;
  if (!invoice || invoice.status !== "ISSUED")
    return "Link an issued invoice first.";
  if (!milestones.length) return "Create a payment schedule first.";
  const initial = milestones[0];
  if (moneyToPaise(initial.remainingAmount ?? initial.amount) > 0n)
    return "The initial milestone must be received first.";
  return null;
}
export function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
