// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { AppShell } from "./app-shell";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn() };
});

describe("AppShell account controls", () => {
  it("provides separate Profile and Sign out actions", async () => {
    vi.mocked(api).mockResolvedValue(undefined);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AppShell
          user={{
            accountId: "account-1",
            role: "CORE_ADMIN",
            displayName: "Core Admin",
            driverId: null,
          }}
        >
          Content
        </AppShell>
      </QueryClientProvider>,
    );
    expect(
      screen.getAllByRole("link", { name: /profile/i }).length,
    ).toBeGreaterThan(0);
    const signOut = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(signOut);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/v1/auth/logout", {
        core: false,
        method: "POST",
      }),
    );
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows a failed sign-out request and keeps the current page open", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Sign out failed"));
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AppShell
          user={{
            accountId: "account-1",
            role: "CORE_ADMIN",
            displayName: "Core Admin",
            driverId: null,
          }}
        >
          Content
        </AppShell>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out failed",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["CORE_REPORT_VIEWER", "CORE_DATA_ENTRY"] as const)(
    "hides audit navigation from %s",
    (role) => {
      const client = new QueryClient();
      render(
        <QueryClientProvider client={client}>
          <AppShell
            user={{
              accountId: "account-1",
              role,
              displayName: "Core User",
              driverId: null,
            }}
          >
            Content
          </AppShell>
        </QueryClientProvider>,
      );
      expect(
        screen.queryByRole("link", { name: "Audit activity" }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows audit navigation to Core administrators", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AppShell
          user={{
            accountId: "account-1",
            role: "CORE_ADMIN",
            displayName: "Core Admin",
            driverId: null,
          }}
        >
          Content
        </AppShell>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Audit activity" }),
    ).toHaveAttribute("href", "/reports/audit");
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
