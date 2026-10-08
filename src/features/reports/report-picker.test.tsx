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
import { afterEach, expect, it, vi } from "vitest";
import { getCollection, ApiError } from "@/lib/api/client";
import { MasterPicker } from "./report-shared";

vi.mock("@/lib/api/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/client")>();
  return { ...actual, getCollection: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows a failed report filter request with a retry action", async () => {
  vi.mocked(getCollection).mockRejectedValue(
    new ApiError(503, "UNAVAILABLE", "Cannot load companies.", "req-picker"),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MasterPicker
        resource="companies"
        label="Company"
        value=""
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot load companies.",
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("req-picker");
});

it("paginates and searches company matches on the server rather than loading the directory", async () => {
  vi.mocked(getCollection).mockResolvedValue({
    data: [{ id: "company-1", name: "Eastern Risen" }],
    pagination: { page: 1, pageSize: 25, total: 130 },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MasterPicker
        resource="companies"
        label="Company"
        value=""
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole("option", { name: "Eastern Risen" });
  expect(getCollection).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(getCollection).toHaveBeenCalledWith(
      "/companies?page=2&pageSize=25",
      expect.any(AbortSignal),
    ),
  );
  fireEvent.change(screen.getByLabelText("Search company"), {
    target: { value: "contact@example.test" },
  });
  await waitFor(() =>
    expect(getCollection).toHaveBeenCalledWith(
      "/companies?page=1&pageSize=25&q=contact%40example.test",
      expect.any(AbortSignal),
    ),
  );
  // Search can match email even though only the company name is displayed.
  expect(
    await screen.findByRole("option", { name: "Eastern Risen" }),
  ).toBeInTheDocument();
});
