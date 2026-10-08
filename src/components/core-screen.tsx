"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import { useSession } from "./app-providers";
import { Loading } from "./ui";
import { isCoreRole } from "@/lib/permissions";

export function CoreScreen({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session.isLoading && (!session.user || !isCoreRole(session.user.role)))
      router.replace("/login");
  }, [session.isLoading, session.user, router]);
  if (session.isLoading)
    return (
      <div className="session-screen">
        <Loading label="Verifying your Core session" />
      </div>
    );
  if (!session.user || !isCoreRole(session.user.role)) {
    return null;
  }
  return <AppShell user={session.user}>{children}</AppShell>;
}
