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
const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.search,
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
  navigation.search = new URLSearchParams();
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

it("opens the exact record destination after successful sign in", async () => {
  navigation.search = new URLSearchParams({
    returnTo: "/invoices/edit?id=invoice-1",
  });
  vi.mocked(api).mockResolvedValue({});
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
  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith(
      "/invoices/edit?id=invoice-1",
    ),
  );
});
