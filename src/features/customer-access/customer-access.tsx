"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ApiError, apiFieldError, getResource, safeId } from "@/lib/api/client";
import type { CoreMaster, CoreRole } from "@/lib/api/contracts";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  StatusBadge,
} from "@/components/ui";
import {
  accessApi,
  accessKey,
  invitationState,
  membershipAccess,
  type InvitationResult,
  type InviteContactRequest,
} from "./api";

type Revoke = {
  kind: "memberships" | "invitations";
  id: string;
  displayName: string;
  email: string;
};
type View = "list" | "invite" | "result" | "revoke";
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

export function CustomerAccessDialog({
  customer,
  role,
  onClose,
}: {
  customer: CoreMaster;
  role: CoreRole;
  onClose: () => void;
}) {
  if (role !== "CORE_ADMIN") return null;
  return (
    <AccessDialog key={customer.id} customer={customer} onClose={onClose} />
  );
}

function AccessDialog({
  customer,
  onClose,
}: {
  customer: CoreMaster;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [target, setTarget] = useState<Revoke | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [retryAt, setRetryAt] = useState(0);
  const alive = useRef(false);
  const pending = useRef(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const master = useQuery({
    queryKey: ["customers", customer.id, "access-master"],
    queryFn: ({ signal }) =>
      getResource<CoreMaster>(`/customers/${safeId(customer.id)}`, signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const access = useQuery({
    queryKey: accessKey(customer.id),
    queryFn: ({ signal }) => accessApi.read(customer.id, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.error instanceof ApiError &&
      [401, 403, 429].includes(query.state.error.status)
        ? false
        : 60_000,
    enabled: !denied,
  });
  const current = master.data?.data ?? customer;
  const readRetryAt =
    access.error instanceof ApiError && access.error.status === 429
      ? access.errorUpdatedAt + (access.error.retryAfterSeconds ?? 60) * 1000
      : 0;
  const masterRetryAt =
    master.error instanceof ApiError && master.error.status === 429
      ? master.errorUpdatedAt + (master.error.retryAfterSeconds ?? 60) * 1000
      : 0;
  const retryDeadline = Math.max(retryAt, readRetryAt, masterRetryAt);
  const rateLimited = now < retryDeadline;
  const active =
    !unavailable &&
    !master.isError &&
    !master.isPending &&
    current.status === "ACTIVE";
  useEffect(() => {
    alive.current = true;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  function recover(error: unknown) {
    if (!(error instanceof ApiError)) return;
    if (error.status === 401) {
      cache.clear();
      dismiss();
      router.replace("/login");
    }
    if (error.code === "CORE_ACCESS_REQUIRED") setDenied(true);
  }
  const readError = access.error ?? master.error;
  useEffect(() => {
    if (readError instanceof ApiError && readError.status === 401) {
      alive.current = false;
      cache.clear();
      onClose();
      router.replace("/login");
    }
  }, [readError, cache, router, onClose]);
  const forbidden =
    denied ||
    (readError instanceof ApiError &&
      readError.code === "CORE_ACCESS_REQUIRED");
  function dismiss() {
    alive.current = false;
    setResult(null);
    onClose();
  }
  function back() {
    setResult(null);
    setTarget(null);
    setError(null);
    setCopyError("");
    setCopied(false);
    setView("list");
  }
  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: accessKey(customer.id) }),
      cache.invalidateQueries({ queryKey: ["customers"] }),
    ]);
  }
  async function perform(
    action: () => Promise<InvitationResult | void>,
    isInvite: boolean,
  ) {
    if (
      pending.current ||
      forbidden ||
      now < retryDeadline ||
      (isInvite && !active)
    )
      return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    setResult(null);
    setCopied(false);
    setCopyError("");
    try {
      const created = await action();
      if (!alive.current) return;
      if (created) {
        setResult(created);
        setView("result");
      } else {
        setTarget(null);
        setView("list");
        setNotice("Revocation completed. Access history has been refreshed.");
      }
    } catch (caught) {
      if (!alive.current) return;
      setError(caught);
      recover(caught);
      if (!alive.current) return;
      const code = caught instanceof ApiError ? caught.code : "";
      if (caught instanceof ApiError && caught.status === 429)
        setRetryAt(caught.receivedAt + (caught.retryAfterSeconds ?? 60) * 1000);
      if (code === "CUSTOMER_UNAVAILABLE") setUnavailable(true);
      const guidance: Record<string, string> = {
        CORE_ACCESS_REQUIRED:
          "You do not have permission to administer customer account access.",
        CUSTOMER_UNAVAILABLE:
          "This customer is missing or inactive. Review the refreshed customer record before inviting.",
        CUSTOMER_ALREADY_HAS_ACCESS:
          "This contact already has access. Review their membership below; no new invitation is needed.",
        CUSTOMER_EMAIL_UNAVAILABLE:
          "Use an appropriate customer identity or investigate this incompatible or disabled account. Staff accounts cannot be converted here.",
        INVITATION_NOT_FOUND:
          "The invitation has changed or was accepted. Review the refreshed list; access was not confirmed revoked.",
        MEMBERSHIP_NOT_FOUND:
          "The membership has changed. Review the refreshed list; access was not confirmed revoked.",
        ROUTE_NOT_FOUND:
          "The customer access API may not be deployed. Ask the operator to verify the API deployment and configured origin.",
        ORIGIN_NOT_ALLOWED:
          "The admin origin needs to be allowed by the API deployment.",
        RATE_LIMIT_EXCEEDED:
          "Too many requests. Wait before explicitly trying again.",
      };
      setNotice(
        guidance[code] ??
          (isInvite
            ? "The invitation may have been created. Review the refreshed list before explicitly resending; resending replaces the old link."
            : "Review the refreshed server state before trying again."),
      );
      if (
        [
          "CUSTOMER_ALREADY_HAS_ACCESS",
          "INVITATION_NOT_FOUND",
          "MEMBERSHIP_NOT_FOUND",
        ].includes(code)
      ) {
        setView("list");
        setTarget(null);
      }
    } finally {
      if (alive.current) {
        await refresh();
        if (alive.current) {
          setBusy(false);
          pending.current = false;
        }
      }
    }
  }
  function invite(input: InviteContactRequest) {
    return perform(() => accessApi.invite(customer.id, input), true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError(
        new ApiError(
          400,
          "REQUEST_VALIDATION_FAILED",
          "Enter a contact name.",
          undefined,
          {
            fields: [
              { field: "body.displayName", message: "Enter a nonblank name." },
            ],
          },
        ),
      );
      return;
    }
    void invite({ displayName: name, email });
  }
  return (
    <Modal
      protectChanges={false}
      title="Account access"
      subtitle={`${String(current.name ?? "Customer")} · ${String(current.category ?? "")} · ${current.status}`}
      onClose={dismiss}
    >
      <div className="account-access">
        {rateLimited && (
          <p className="notice" role="status">
            Rate limit reached. Try again after{" "}
            {date(new Date(retryDeadline).toISOString())}.
          </p>
        )}
        <p className="notice">
          Invited contacts can see this customer&apos;s full customer-visible
          historical and future bookings and billing, accept quotes and initiate
          payments. Verify the contact and customer relationship before sharing
          access.
        </p>
        {current.status !== "ACTIVE" && (
          <p className="notice">
            Invitations are unavailable for inactive or archived customers.
            Customer account data is hidden from contacts while this customer is
            inactive; staff can still review access history.
          </p>
        )}
        {forbidden ? (
          <ErrorState
            error={
              error ??
              readError ??
              new Error(
                "You do not have permission to administer customer account access.",
              )
            }
          />
        ) : (
          <>
            {Boolean(error) && <ErrorState error={error} />}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            {view === "list" && (
              <>
                <div className="access-actions">
                  <Button
                    disabled={!active || busy || rateLimited}
                    onClick={() => {
                      setName("");
                      setEmail("");
                      setError(null);
                      setNotice("");
                      setView("invite");
                    }}
                  >
                    Invite contact
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || rateLimited || access.isFetching}
                    onClick={() => void refresh()}
                  >
                    Refresh access
                  </Button>
                </div>
                {master.isError && (
                  <ErrorState
                    error={master.error}
                    onRetry={
                      rateLimited ? undefined : () => void master.refetch()
                    }
                  />
                )}
                {access.isPending ? (
                  <Loading label="Loading account access" />
                ) : access.isError ? (
                  <>
                    <ErrorState
                      error={access.error}
                      onRetry={
                        rateLimited ? undefined : () => void access.refetch()
                      }
                    />
                    {access.error instanceof ApiError &&
                      access.error.code === "ROUTE_NOT_FOUND" && (
                        <p className="notice">
                          Verify that the deployed API includes the customer
                          access routes.
                        </p>
                      )}
                  </>
                ) : (
                  access.data && (
                    <>
                      <h3>Memberships</h3>
                      {access.data.data.memberships.length === 0 ? (
                        <Empty
                          title="No memberships"
                          detail="Invite a verified contact to grant access. To restore revoked access, send a fresh invitation."
                        />
                      ) : (
                        <div
                          className="table-scroll"
                          role="region"
                          aria-label="Memberships table"
                          tabIndex={0}
                        >
                          <table>
                            <thead>
                              <tr>
                                <th>Contact</th>
                                <th>Account status</th>
                                <th>Granted</th>
                                <th>Access status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...access.data.data.memberships]
                                .sort(
                                  (a, b) =>
                                    a.displayName.localeCompare(
                                      b.displayName,
                                    ) || a.id.localeCompare(b.id),
                                )
                                .map((member) => (
                                  <tr key={member.id}>
                                    <td className="access-contact">
                                      <strong>{member.displayName}</strong>
                                      <span>{member.email}</span>
                                    </td>
                                    <td>
                                      <StatusBadge value={member.status} />
                                    </td>
                                    <td>{date(member.createdAt)}</td>
                                    <td>
                                      <StatusBadge
                                        value={membershipAccess(
                                          member,
                                          current.status,
                                        )}
                                      />
                                      {member.revokedAt && (
                                        <small>
                                          Revoked {date(member.revokedAt)}
                                        </small>
                                      )}
                                    </td>
                                    <td>
                                      {!member.revokedAt && (
                                        <Button
                                          variant="danger"
                                          disabled={busy || rateLimited}
                                          onClick={() => {
                                            setError(null);
                                            setTarget({
                                              kind: "memberships",
                                              ...member,
                                            });
                                            setView("revoke");
                                          }}
                                        >
                                          Revoke access
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="muted">
                        A person&apos;s account lifecycle is separate from their
                        membership. To restore revoked membership access, send a
                        fresh invitation.
                      </p>
                      <h3>Invitations</h3>
                      <p className="muted">
                        Latest 100 invitations. Resending creates a fresh link
                        and immediately invalidates the old link. Existing
                        customer users accept with their current password.
                      </p>
                      {access.data.data.invitations.length === 0 ? (
                        <Empty
                          title="No invitations"
                          detail="Additional contacts use the same Invite contact form."
                        />
                      ) : (
                        <div
                          className="table-scroll"
                          role="region"
                          aria-label="Invitations table"
                          tabIndex={0}
                        >
                          <table>
                            <thead>
                              <tr>
                                <th>Contact</th>
                                <th>Created / Expires</th>
                                <th>State</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {access.data.data.invitations.map(
                                (invitation) => {
                                  const state = invitationState(
                                    invitation,
                                    now,
                                  );
                                  const actionable =
                                    state === "PENDING" || state === "EXPIRED";
                                  return (
                                    <tr key={invitation.id}>
                                      <td className="access-contact">
                                        <strong>
                                          {invitation.displayName}
                                        </strong>
                                        <span>{invitation.email}</span>
                                      </td>
                                      <td>
                                        {date(invitation.createdAt)}
                                        <small>
                                          Expires {date(invitation.expiresAt)}
                                        </small>
                                      </td>
                                      <td>
                                        <StatusBadge value={state} />
                                      </td>
                                      <td>
                                        {actionable && (
                                          <div className="access-actions">
                                            <Button
                                              variant="secondary"
                                              disabled={
                                                !active || busy || rateLimited
                                              }
                                              onClick={() =>
                                                void invite(invitation)
                                              }
                                            >
                                              Resend
                                            </Button>
                                            <Button
                                              variant="danger"
                                              disabled={busy || rateLimited}
                                              onClick={() => {
                                                setError(null);
                                                setTarget({
                                                  kind: "invitations",
                                                  ...invitation,
                                                });
                                                setView("revoke");
                                              }}
                                            >
                                              Revoke invitation
                                            </Button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                },
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )
                )}
              </>
            )}
            {view === "invite" && (
              <form className="access-form" onSubmit={submit}>
                <h3>Invite contact to {String(current.name)}</h3>
                <Field
                  label="Contact name"
                  error={apiFieldError(error, "body.displayName")}
                >
                  <Input
                    autoFocus
                    required
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy || rateLimited}
                  />
                </Field>
                <Field
                  label="Contact email"
                  error={apiFieldError(error, "body.email")}
                >
                  <Input
                    required
                    type="email"
                    maxLength={320}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmail(email.trim().toLowerCase())}
                    disabled={busy || rateLimited}
                  />
                </Field>
                {!active && (
                  <p className="notice">
                    Invite is unavailable. Return to access history and review
                    the current customer status.
                  </p>
                )}
                <div className="access-actions">
                  <Button
                    type="submit"
                    disabled={!active || busy || rateLimited}
                  >
                    {busy ? "Creating invitation…" : "Create invitation"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={back}
                  >
                    Back to access
                  </Button>
                </div>
              </form>
            )}
            {view === "result" && result && (
              <section aria-label="Invitation result">
                <h3>Invitation for {result.displayName}</h3>
                <p>
                  {result.email} · {String(current.name)}
                </p>
                <p role="status">
                  {result.delivery === "QUEUED"
                    ? "Invitation queued for email"
                    : result.delivery === "MANUAL"
                      ? "Copy and share this invitation with the verified contact."
                      : "Delivery state is unavailable. Verify delivery with the operator."}
                </p>
                {result.delivery === "QUEUED" && (
                  <p>Queueing does not confirm inbox delivery.</p>
                )}
                <p>Expires {date(result.expiresAt)}</p>
                {result.activationUrl ? (
                  <>
                    <Field label="Activation URL">
                      <Input readOnly value={result.activationUrl} />
                    </Field>
                    <Button
                      disabled={busy || rateLimited}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            result.activationUrl!,
                          );
                          if (alive.current) setCopied(true);
                        } catch {
                          if (alive.current)
                            setCopyError(
                              "Could not copy. Select the activation URL and copy it manually.",
                            );
                        }
                      }}
                    >
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                    {copyError && <p role="alert">{copyError}</p>}
                  </>
                ) : (
                  <p className="notice">
                    No activation URL is configured. Ask the backend operator to
                    set CUSTOMER_ACCOUNT_URL to the deployed customer account
                    base, then explicitly resend for a fresh link.
                  </p>
                )}
                <p className="muted">
                  This link is shown only now. Closing clears it; resend creates
                  a new link.
                </p>
                <Button variant="secondary" disabled={busy} onClick={back}>
                  Done
                </Button>
              </section>
            )}
            {view === "revoke" && target && (
              <section>
                <h3>
                  {target.kind === "memberships"
                    ? "Revoke access"
                    : "Revoke invitation"}{" "}
                  for {target.displayName}?
                </h3>
                <p>
                  {target.email} · {String(current.name)}
                </p>
                <p>
                  {target.kind === "memberships"
                    ? "This removes this person's customer membership access and revokes pending invitations for this customer."
                    : "This invitation link will no longer grant access."}{" "}
                  Previously shared booking links remain valid until rotated
                  separately using the existing booking controls.
                </p>
                <div className="access-actions">
                  <Button
                    variant="danger"
                    disabled={busy || rateLimited}
                    onClick={() =>
                      void perform(
                        () =>
                          accessApi.revoke(customer.id, target.kind, target.id),
                        false,
                      )
                    }
                  >
                    {busy ? "Revoking…" : "Confirm revocation"}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={back}>
                    Cancel
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
