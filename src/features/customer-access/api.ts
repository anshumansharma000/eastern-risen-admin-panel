import { api, safeId } from "@/lib/api/client";
import type { Resource } from "@/lib/api/contracts";

export interface Membership {
  id: string;
  accountId: string;
  displayName: string;
  email: string;
  status: string;
  createdAt: string;
  revokedAt: string | null;
}
export interface Invitation {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}
export interface CustomerAccess {
  memberships: Membership[];
  invitations: Invitation[];
}
export interface InviteContactRequest {
  email: string;
  displayName: string;
}
// Deliberately omit activationToken: never retain it in component or query state.
export interface InvitationResult extends InviteContactRequest {
  id: string;
  expiresAt: string;
  activationUrl: string | null;
  delivery: string;
}
const path = (customerId: string) => `/customers/${safeId(customerId)}`;
export const accessKey = (customerId: string) => [
  "customer-access",
  customerId,
];
export const accessApi = {
  read: (customerId: string, signal?: AbortSignal) =>
    api<Resource<CustomerAccess>>(`${path(customerId)}/access`, { signal }),
  invite: async (
    customerId: string,
    input: InviteContactRequest,
  ): Promise<InvitationResult> => {
    const response = await api<Resource<InvitationResult>>(
      `${path(customerId)}/invitations`,
      {
        method: "POST",
        body: {
          email: input.email.trim().toLowerCase(),
          displayName: input.displayName.trim(),
        },
      },
    );
    const { id, email, displayName, expiresAt, activationUrl, delivery } =
      response.data;
    return { id, email, displayName, expiresAt, activationUrl, delivery };
  },
  revoke: (
    customerId: string,
    kind: "memberships" | "invitations",
    id: string,
  ) =>
    api<void>(`${path(customerId)}/${kind}/${safeId(id)}`, {
      method: "DELETE",
    }),
};
export function invitationState(invitation: Invitation, now = Date.now()) {
  if (invitation.consumedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (Date.parse(invitation.expiresAt) <= now) return "EXPIRED";
  return "PENDING";
}
export function membershipAccess(
  membership: Membership,
  customerStatus: string,
) {
  if (membership.revokedAt) return "REVOKED";
  if (customerStatus !== "ACTIVE") return "CUSTOMER_UNAVAILABLE";
  if (membership.status !== "ACTIVE") return "ACCOUNT_UNAVAILABLE";
  return "ACTIVE";
}
