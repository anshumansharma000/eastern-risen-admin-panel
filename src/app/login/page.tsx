"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { Button, ErrorState, Field, Input } from "@/components/ui";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="session-screen">Preparing secure sign in…</main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const cache = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [show, setShow] = useState(false);
  const passwordChanged = search.get("reason") === "password-changed";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/v1/auth/core/login", {
        core: false,
        method: "POST",
        body: {
          username: data.get("username"),
          password: data.get("password"),
        },
      });
      await cache.invalidateQueries({ queryKey: ["session"] });
      const requested = search.get("returnTo");
      router.replace(
        requested?.startsWith("/") && !requested.startsWith("//")
          ? requested
          : "/",
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 429
          ? "Too many sign-in attempts. Wait a minute and try again."
          : cause instanceof ApiError && cause.status === 401
            ? "The username or password is incorrect."
            : cause,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-brand">
        <BrandLogo className="login-logo" variant="on-dark" priority />
        <div className="login-copy">
          <p className="eyebrow">Core administration</p>
          <h1>
            Every journey,
            <br />
            balanced precisely.
          </h1>
          <p>
            Manage travel-service billing, receivables, and operational master
            data from one trusted ledger.
          </p>
        </div>
        <div className="login-proof">
          <ShieldCheck />
          <span>Secure staff access · no customer self-service</span>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit} className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Core</h2>
          <p>
            Use your staff username. Your session is kept in a secure browser
            cookie.
          </p>
          {passwordChanged && (
            <div className="success-panel" role="status">
              Your password was changed. Every session was signed out; sign in
              again with your new password.
            </div>
          )}
          <Field label="Username">
            <Input
              name="username"
              autoComplete="username"
              required
              minLength={1}
              maxLength={64}
              autoFocus
            />
          </Field>
          <Field label="Password">
            <div className="password-wrap">
              <Input
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                minLength={1}
                maxLength={128}
              />
              <button
                type="button"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </Field>
          {typeof error === "string" ? (
            <div className="form-alert" role="alert">
              {error}
            </div>
          ) : error ? (
            <ErrorState error={error} />
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? (
              "Signing in…"
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </Button>
          <small>Having trouble? Contact a Core administrator.</small>
        </form>
      </section>
    </main>
  );
}
