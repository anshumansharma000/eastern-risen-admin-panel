export const categories = {
  GENERAL: "Latest",
  NEW_JOURNEY: "New journey",
  SEASONAL: "Seasonal highlight",
  TRAVEL_ADVISORY: "Travel update",
  SERVICE_UPDATE: "Service update",
} as const;
export type AnnouncementInput = {
  name: string;
  category: keyof typeof categories;
  message: string;
  linkText: string | null;
  linkUrl: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  startsAt: string;
  endsAt: string | null;
  placement: "HOME" | "PUBLIC" | "SELECTED";
  paths: string[];
  priority: "NORMAL" | "IMPORTANT";
  dismissible: boolean;
};
export type Announcement = AnnouncementInput & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type PublicAnnouncement = Pick<
  Announcement,
  | "id"
  | "category"
  | "message"
  | "linkText"
  | "linkUrl"
  | "priority"
  | "dismissible"
  | "startsAt"
  | "endsAt"
> & { revision: number };

export function indiaInput(iso: string) {
  return new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 16);
}
export function indiaISO(value: string) {
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Enter a valid date and time.");
  return date.toISOString();
}
export function scheduleLabel(item: Announcement, now = Date.now()) {
  if (item.status === "DRAFT") return "Draft";
  if (item.status === "ARCHIVED") return "Archived";
  if (item.endsAt && Date.parse(item.endsAt) <= now) return "Expired";
  if (Date.parse(item.startsAt) > now) return "Scheduled";
  return "Live";
}
