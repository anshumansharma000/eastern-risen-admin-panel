import type { CoreRole } from "./api/contracts";

export type Capability =
  | "read"
  | "writeOperational"
  | "writeConfiguration"
  | "billing"
  | "receipts"
  | "adminFinance"
  | "users";
const grants: Record<CoreRole, Capability[]> = {
  CORE_ADMIN: [
    "read",
    "writeOperational",
    "writeConfiguration",
    "billing",
    "receipts",
    "adminFinance",
    "users",
  ],
  CORE_DATA_ENTRY: ["read", "writeOperational", "billing", "receipts"],
  CORE_REPORT_VIEWER: ["read"],
};
export const isCoreRole = (role: string): role is CoreRole => role in grants;
export const can = (role: CoreRole, capability: Capability) =>
  grants[role].includes(capability);
export const canManageVehicleLifecycle = (role: CoreRole) =>
  role === "CORE_ADMIN";
export const roleLabel = (role: CoreRole) =>
  ({
    CORE_ADMIN: "Core administrator",
    CORE_DATA_ENTRY: "Data-entry operator",
    CORE_REPORT_VIEWER: "Report viewer",
  })[role];
