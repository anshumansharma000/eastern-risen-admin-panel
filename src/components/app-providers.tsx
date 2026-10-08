"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { AuthSession, Resource } from "@/lib/api/contracts";

const SessionContext = createContext<ReturnType<typeof useSessionValue> | null>(
  null,
);

function useSessionValue() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) =>
      api<Resource<AuthSession>>("/api/v1/auth/me", { core: false, signal }),
    retry: false,
    staleTime: 30_000,
  });
  return { ...session, user: session.data?.data.user ?? null };
}

function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionValue();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within AppProviders");
  return value;
}
