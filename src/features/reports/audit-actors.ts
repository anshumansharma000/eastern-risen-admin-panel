import type { CoreUser } from "@/lib/api/contracts";
import { isCoreRole, roleLabel } from "@/lib/permissions";
import type { AuditRow } from "./contracts";

export function resolveAuditActor(row: AuditRow, users: readonly CoreUser[]) {
  const user = users.find((item) => item.id === row.actorId);
  const suppliedName = row.actorDisplayName?.trim();
  const name =
    suppliedName || user?.displayName?.trim() || user?.username?.trim();
  const suppliedRole = row.actorRole;
  const role =
    suppliedRole && isCoreRole(suppliedRole)
      ? roleLabel(suppliedRole)
      : user?.role && isCoreRole(user.role)
        ? `${roleLabel(user.role)} · current role`
        : "";
  return {
    name: name || "Unknown actor",
    details: [user?.username ? `@${user.username}` : "", role]
      .filter(Boolean)
      .join(" · "),
    resolved: Boolean(name),
  };
}
