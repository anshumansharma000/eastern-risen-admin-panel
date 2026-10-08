"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { api, ApiError, getResource } from "@/lib/api/client";
import type { CoreProfile, Resource } from "@/lib/api/contracts";
import { useFormGuard } from "@/components/form-guard";
import { roleLabel } from "@/lib/permissions";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Loading,
  StatusBadge,
} from "@/components/ui";

type EditableProfile = Pick<CoreProfile, "username" | "displayName" | "email">;
type ProfileErrors = Partial<Record<keyof EditableProfile, string>>;
type PasswordErrors = Partial<
  Record<"currentPassword" | "newPassword" | "confirmation", string>
>;

export function buildProfilePatch(
  current: EditableProfile,
  values: EditableProfile,
): Partial<EditableProfile> {
  return Object.fromEntries(
    (Object.keys(values) as Array<keyof EditableProfile>)
      .filter((key) => values[key] !== current[key])
      .map((key) => [key, values[key]]),
  );
}

export async function finishPasswordChange(
  cache: QueryClient,
  replace: (href: string) => void,
) {
  await cache.cancelQueries();
  cache.clear();
  replace("/login?reason=password-changed");
}

export function ProfilePage() {
  const [profileDirty, setProfileDirty] = useState(false);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const router = useRouter();
  const cache = useQueryClient();
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [profileError, setProfileError] = useState<unknown>();
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [passwordError, setPasswordError] = useState<unknown>();
  const [visiblePasswords, setVisiblePasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmation: false,
  });
  const usernameRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const profileSuccessRef = useRef<HTMLDivElement>(null);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: ({ signal }) => getResource<CoreProfile>("/profile", signal),
  });
  const updateProfile = useMutation({
    mutationFn: (payload: Partial<EditableProfile>) =>
      api<Resource<CoreProfile>>("/profile", {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: async (result) => {
      clearProfileGuard();
      setProfileDirty(false);
      cache.setQueryData(["profile"], result);
      setProfileSuccess(true);
      setProfileError(undefined);
      setProfileErrors({});
      await cache.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (cause) => {
      setProfileSuccess(false);
      if (
        setConflictFieldError(cause, setProfileErrors, {
          ACCOUNT_USERNAME_ALREADY_EXISTS: "username",
          ACCOUNT_EMAIL_ALREADY_EXISTS: "email",
        })
      ) {
        setProfileError(undefined);
      } else {
        setProfileError(cause);
      }
    },
  });
  const changePassword = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api<void>("/profile/change-password", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      clearProfileGuard();
      clearPasswordGuard();
      setProfileDirty(false);
      setPasswordDirty(false);
      return finishPasswordChange(cache, router.replace);
    },
    onError: (cause) => {
      if (
        setConflictFieldError(cause, setPasswordErrors, {
          CURRENT_PASSWORD_INVALID: "currentPassword",
          PASSWORD_REUSE_NOT_ALLOWED: "newPassword",
        })
      ) {
        setPasswordError(undefined);
      } else {
        setPasswordError(cause);
      }
    },
  });

  const clearProfileGuard = useFormGuard(profileDirty, updateProfile.isPending);
  const clearPasswordGuard = useFormGuard(
    passwordDirty,
    changePassword.isPending,
  );
  useEffect(() => {
    focusFirstError(profileErrors, {
      username: usernameRef,
      displayName: displayNameRef,
      email: emailRef,
    });
  }, [profileErrors]);
  useEffect(() => {
    focusFirstError(passwordErrors, {
      currentPassword: currentPasswordRef,
      newPassword: newPasswordRef,
      confirmation: confirmationRef,
    });
  }, [passwordErrors]);
  useEffect(() => {
    if (profileSuccess) profileSuccessRef.current?.focus();
  }, [profileSuccess]);

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.data) return;
    setProfileSuccess(false);
    setProfileError(undefined);
    const data = new FormData(event.currentTarget);
    const values: EditableProfile = {
      username: String(data.get("username") ?? "").trim(),
      displayName: String(data.get("displayName") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
    };
    const errors = validateProfile(values);
    const patch = buildProfilePatch(profile.data.data, values);
    if (!Object.keys(patch).length && !Object.keys(errors).length) {
      errors.displayName = "Change at least one field before saving.";
    }
    setProfileErrors(errors);
    if (!Object.keys(errors).length) updateProfile.mutate(patch);
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(undefined);
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    const errors = validatePassword(currentPassword, newPassword, confirmation);
    setPasswordErrors(errors);
    if (!Object.keys(errors).length) {
      changePassword.mutate({ currentPassword, newPassword });
    }
  }

  if (profile.isLoading) return <Loading label="Loading your profile" />;
  if (profile.isError)
    return (
      <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
    );
  const account = profile.data!.data;
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Your account</p>
          <h1>Profile</h1>
          <p>Review your Core account and keep your sign-in details current.</p>
        </div>
      </header>
      <section className="profile-summary" aria-labelledby="account-summary">
        <div className="card-header">
          <div>
            <p className="eyebrow">Account summary</p>
            <h2 id="account-summary">{account.displayName}</h2>
          </div>
          <StatusBadge value={account.status} />
        </div>
        <dl>
          <Summary label="Username" value={account.username} />
          <Summary label="Email" value={account.email} />
          <Summary label="Role" value={roleLabel(account.role)} />
          <Summary label="Status" value={account.status.replaceAll("_", " ")} />
          <Summary label="Last login" value={formatDate(account.lastLoginAt)} />
          <Summary
            label="Password changed"
            value={formatDate(account.passwordChangedAt)}
          />
        </dl>
      </section>
      <div className="profile-grid">
        <section className="form-section" aria-labelledby="profile-details">
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2 id="profile-details">Profile details</h2>
              <p>Update your username, name or email.</p>
            </div>
          </div>
          <form
            className="profile-form"
            onChange={() => setProfileDirty(true)}
            onSubmit={submitProfile}
            key={account.updatedAt}
            noValidate
          >
            <Field label="Username" error={profileErrors.username}>
              <Input
                ref={usernameRef}
                name="username"
                required
                minLength={3}
                maxLength={64}
                pattern="[a-zA-Z0-9_.-]+"
                autoComplete="username"
                defaultValue={account.username}
                aria-invalid={Boolean(profileErrors.username)}
              />
            </Field>
            <Field label="Display name" error={profileErrors.displayName}>
              <Input
                ref={displayNameRef}
                name="displayName"
                required
                maxLength={200}
                autoComplete="name"
                defaultValue={account.displayName}
                aria-invalid={Boolean(profileErrors.displayName)}
              />
            </Field>
            <Field label="Email" error={profileErrors.email}>
              <Input
                ref={emailRef}
                name="email"
                type="email"
                required
                maxLength={320}
                autoComplete="email"
                defaultValue={account.email}
                aria-invalid={Boolean(profileErrors.email)}
              />
            </Field>
            {Boolean(profileError) && <ErrorState error={profileError} />}
            {profileSuccess && (
              <div
                className="success-panel"
                role="status"
                tabIndex={-1}
                ref={profileSuccessRef}
              >
                Profile updated. The account name in the application has been
                refreshed.
              </div>
            )}
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </section>
        <section className="form-section" aria-labelledby="change-password">
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2 id="change-password">Change password</h2>
              <p>
                A successful change signs out every session, including this one.
              </p>
            </div>
          </div>
          <form
            className="profile-form"
            onChange={() => setPasswordDirty(true)}
            onSubmit={submitPassword}
            noValidate
          >
            <PasswordField
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
              inputRef={currentPasswordRef}
              visible={visiblePasswords.currentPassword}
              onToggle={() =>
                setVisiblePasswords((value) => ({
                  ...value,
                  currentPassword: !value.currentPassword,
                }))
              }
              error={passwordErrors.currentPassword}
            />
            <PasswordField
              label="New password"
              name="newPassword"
              autoComplete="new-password"
              inputRef={newPasswordRef}
              visible={visiblePasswords.newPassword}
              onToggle={() =>
                setVisiblePasswords((value) => ({
                  ...value,
                  newPassword: !value.newPassword,
                }))
              }
              error={passwordErrors.newPassword}
              minLength={12}
            />
            <PasswordField
              label="Confirm new password"
              name="confirmation"
              autoComplete="new-password"
              inputRef={confirmationRef}
              visible={visiblePasswords.confirmation}
              onToggle={() =>
                setVisiblePasswords((value) => ({
                  ...value,
                  confirmation: !value.confirmation,
                }))
              }
              error={passwordErrors.confirmation}
              minLength={12}
            />
            {Boolean(passwordError) && <ErrorState error={passwordError} />}
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending
                ? "Changing password…"
                : "Change password"}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}

export function validateProfile(values: EditableProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  if (values.username.length < 3 || values.username.length > 64) {
    errors.username = "Username must be between 3 and 64 characters.";
  } else if (!/^[a-zA-Z0-9_.-]+$/.test(values.username)) {
    errors.username =
      "Use only letters, numbers, underscores, periods, and hyphens.";
  }
  if (!values.displayName || values.displayName.length > 200) {
    errors.displayName = "Display name must be between 1 and 200 characters.";
  }
  if (
    values.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
  ) {
    errors.email =
      "Enter a valid email address of no more than 320 characters.";
  }
  return errors;
}

export function validatePassword(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!currentPassword) errors.currentPassword = "Enter your current password.";
  if (newPassword.length < 12 || newPassword.length > 128) {
    errors.newPassword = "New password must be between 12 and 128 characters.";
  }
  if (confirmation !== newPassword) {
    errors.confirmation = "New password and confirmation must match.";
  }
  return errors;
}

function setConflictFieldError<T extends string>(
  cause: unknown,
  setter: (errors: Partial<Record<T, string>>) => void,
  fields: Record<string, T>,
) {
  if (!(cause instanceof ApiError) || !fields[cause.code]) return false;
  setter({ [fields[cause.code]]: cause.message } as Partial<Record<T, string>>);
  return true;
}

function focusFirstError<T extends string>(
  errors: Partial<Record<T, string>>,
  refs: Record<T, RefObject<HTMLInputElement | null>>,
) {
  const key = (Object.keys(refs) as T[]).find((name) => errors[name]);
  if (key) refs[key].current?.focus();
}

function PasswordField({
  label,
  name,
  autoComplete,
  inputRef,
  visible,
  onToggle,
  error,
  minLength = 1,
}: {
  label: string;
  name: "currentPassword" | "newPassword" | "confirmation";
  autoComplete: string;
  inputRef: RefObject<HTMLInputElement | null>;
  visible: boolean;
  onToggle: () => void;
  error?: string;
  minLength?: number;
}) {
  return (
    <Field label={label} error={error}>
      <div className="password-wrap">
        <Input
          ref={inputRef}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={128}
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={onToggle}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </Field>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
