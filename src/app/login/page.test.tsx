// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api/client";
import LoginPage from "./page";

vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, api: vi.fn() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function submitLogin(error: ApiError) {
  vi.mocked(api).mockRejectedValue(error);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LoginPage />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "staff" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("sign-in failures", () => {
  it("shows connection errors as connection errors", async () => {
    submitLogin(
      new ApiError(0, "NETWORK_ERROR", "Could not reach the Core API."),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not reach the Core API.",
      ),
    );
  });

  it("keeps incorrect credentials generic", async () => {
    submitLogin(
      new ApiError(401, "INVALID_CREDENTIALS", "Sensitive backend detail"),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The username or password is incorrect.",
      ),
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Sensitive backend detail",
    );
  });
});
