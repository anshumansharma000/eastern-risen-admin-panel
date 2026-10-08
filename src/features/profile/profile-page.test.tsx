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
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getResource } from "@/lib/api/client";
import type { CoreProfile } from "@/lib/api/contracts";
import {
  buildProfilePatch,
  finishPasswordChange,
  ProfilePage,
  validatePassword,
} from "./profile-page";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn(), getResource: vi.fn() };
});

const profile: CoreProfile = {
  accountId: "account-1",
  username: "core.admin",
  displayName: "Core Admin",
  email: "admin@example.com",
  role: "CORE_ADMIN",
  status: "ACTIVE",
  passwordChangedAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: "2026-01-02T00:00:00.000Z",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function renderProfile() {
  vi.mocked(getResource).mockResolvedValue({ data: profile });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...render(<ProfilePage />, { wrapper: Wrapper }), client };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("profile payloads and validation", () => {
  it("builds a changed-field-only PATCH", () => {
    expect(
      buildProfilePatch(profile, { ...profile, displayName: "Updated Admin" }),
    ).toEqual({ displayName: "Updated Admin" });
  });

  it("validates password length and confirmation", () => {
    expect(validatePassword("current", "short", "different")).toEqual({
      newPassword: "New password must be between 12 and 128 characters.",
      confirmation: "New password and confirmation must match.",
    });
  });

  it("clears all cached private state before redirecting", async () => {
    const client = new QueryClient();
    client.setQueryData(["private"], { secret: true });
    const clear = vi.spyOn(client, "clear");
    await finishPasswordChange(client, replace);
    expect(clear).toHaveBeenCalledOnce();
    expect(client.getQueryData(["private"])).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/login?reason=password-changed");
  });
});

describe("ProfilePage", () => {
  it("loads the account and sends only the changed profile field", async () => {
    vi.mocked(api).mockResolvedValue({
      data: { ...profile, displayName: "Updated Admin" },
    });
    renderProfile();
    expect(await screen.findByText("Core administrator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Updated Admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/profile", {
        method: "PATCH",
        body: { displayName: "Updated Admin" },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Profile updated",
    );
  });

  it.each([
    ["ACCOUNT_USERNAME_ALREADY_EXISTS", "Username", "Username is in use"],
    ["ACCOUNT_EMAIL_ALREADY_EXISTS", "Email", "Email is in use"],
  ])("maps %s to the %s field", async (code, label, message) => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, code, message));
    renderProfile();
    await screen.findByText("Core administrator");
    const input = screen.getByLabelText(label);
    fireEvent.change(input, {
      target: {
        value: label === "Username" ? "another.admin" : "another@example.com",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("clears private state and redirects after a successful password change", async () => {
    vi.mocked(api).mockResolvedValue(undefined);
    const { client } = renderProfile();
    const clear = vi.spyOn(client, "clear");
    await screen.findByText("Core administrator");
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(clear).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login?reason=password-changed");
  });
});
