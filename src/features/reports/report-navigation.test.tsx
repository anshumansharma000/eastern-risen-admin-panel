// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { useReportParams, useSessionExpiry } from "./report-shared";

const navigation = vi.hoisted(() => ({
  search: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.search,
  usePathname: () => "/customers/statement",
  useRouter: () => ({ replace: navigation.replace }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

it("retains the customer ID when clearing statement filters", () => {
  navigation.search = new URLSearchParams(
    "id=customer-1&from=2026-01-01&to=2026-02-01",
  );
  const { result } = renderHook(() => useReportParams());
  result.current.clear();
  expect(navigation.replace).toHaveBeenCalledWith(
    "/customers/statement?id=customer-1",
    { scroll: false },
  );
});
it("retains the customer ID when changing statement filters", () => {
  navigation.search = new URLSearchParams("id=customer-1&from=2026-01-01");
  const { result } = renderHook(() => useReportParams());
  result.current.setFilter("to", "2026-02-01");
  const destination = navigation.replace.mock.calls[0][0];
  const url = new URL(destination, "https://admin.example.test");
  expect(url.searchParams.get("id")).toBe("customer-1");
  expect(url.searchParams.get("to")).toBe("2026-02-01");
});
it("returns an expired session to the same record and filters after login", () => {
  window.history.replaceState(
    null,
    "",
    "/customers/statement?id=customer-1&from=2026-01-01",
  );
  renderHook(() =>
    useSessionExpiry(new ApiError(401, "UNAUTHORIZED", "Sign in")),
  );
  const url = new URL(
    navigation.replace.mock.calls[0][0],
    "https://admin.example.test",
  );
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("returnTo")).toBe(
    "/customers/statement?id=customer-1&from=2026-01-01",
  );
});
