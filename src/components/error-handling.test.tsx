// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFieldError } from "@/lib/api/client";
import { ErrorState } from "./ui";
import { CoreApp } from "./core-app";
import { useSession } from "./app-providers";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/invoices",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./app-providers", () => ({ useSession: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("backend error display", () => {
  it("shows field details and request IDs, and returns an individual field message", () => {
    const error = new ApiError(
      422,
      "VALIDATION_FAILED",
      "Check the form.",
      "req-42",
      {
        fields: [
          { field: "displayName", message: "Display name is required." },
        ],
      },
    );
    expect(apiFieldError(error, "displayName")).toBe(
      "Display name is required.",
    );
    render(<ErrorState error={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Check the form.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Display name is required.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("req-42");
  });

  it("shows a retryable session error instead of an indefinite redirect message", () => {
    const refetch = vi.fn();
    vi.mocked(useSession).mockReturnValue({
      isLoading: false,
      isError: true,
      error: new ApiError(503, "UNAVAILABLE", "Core API is unavailable."),
      user: null,
      refetch,
    } as unknown as ReturnType<typeof useSession>);
    render(<CoreApp view="invoices" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Core API is unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });
});
