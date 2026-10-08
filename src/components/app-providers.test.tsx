// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { AppProviders, useSession } from "./app-providers";

vi.mock("@/lib/api/client", () => ({ api: vi.fn() }));

function SessionProbe() {
  const session = useSession();
  return <span>{session.user?.role ?? "NO_ROLE"}</span>;
}

describe("AppProviders", () => {
  afterEach(() => vi.clearAllMocks());

  it("exposes the authenticated principal returned by auth/me", async () => {
    vi.mocked(api).mockResolvedValue({
      data: {
        user: {
          accountId: "account-1",
          role: "CORE_ADMIN",
          displayName: "Core Admin",
          driverId: null,
        },
      },
    });

    render(
      <AppProviders>
        <SessionProbe />
      </AppProviders>,
    );

    expect((await screen.findByText("CORE_ADMIN")).textContent).toBe(
      "CORE_ADMIN",
    );
  });
});
