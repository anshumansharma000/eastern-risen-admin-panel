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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { AnnouncementsPage } from "./announcements-page";
import {
  indiaInput,
  indiaISO,
  scheduleLabel,
  type Announcement,
} from "./contracts";
vi.mock("@/lib/api/client", () => ({ api: vi.fn() }));
vi.mock("@/components/ui", async (original) => {
  const actual = await original<typeof import("@/components/ui")>();
  return {
    ...actual,
    ErrorState: ({ error }: { error: Error }) => (
      <div role="alert">{error.message}</div>
    ),
  };
});
const record: Announcement = {
  id: "one",
  name: "Odisha season",
  category: "SEASONAL",
  message: "Discover Odisha this winter.",
  linkText: "Explore",
  linkUrl: "/tours",
  status: "PUBLISHED",
  startsAt: "2026-10-01T00:00:00Z",
  endsAt: null,
  placement: "HOME",
  paths: [],
  priority: "NORMAL",
  dismissible: true,
  version: 4,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockImplementation(async (path, options) =>
    options?.method
      ? { data: record }
      : path.startsWith("/announcements/active")
        ? { data: [], serverTime: new Date().toISOString() }
        : { data: [record], pagination: { page: 1, pageSize: 25, total: 1 } },
  );
});
afterEach(cleanup);
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <AnnouncementsPage />
    </QueryClientProvider>,
  );
}
describe("announcement manager", () => {
  it("converts India schedules independently of the computer timezone", () => {
    expect(indiaInput("2026-10-27T12:00:00Z")).toBe("2026-10-27T17:30");
    expect(indiaISO("2026-10-27T17:30")).toBe("2026-10-27T12:00:00.000Z");
    expect(scheduleLabel(record, Date.parse("2026-09-01"))).toBe("Scheduled");
    expect(
      scheduleLabel(
        { ...record, endsAt: "2026-10-02T00:00:00Z" },
        Date.parse("2026-10-03"),
      ),
    ).toBe("Expired");
  });
  it("creates a draft and sends scheduling and placement fields", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "New announcement" }));
    fireEvent.change(screen.getByLabelText("Internal name"), {
      target: { value: "Next departure" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "New journeys are here." },
    });
    fireEvent.change(screen.getByLabelText("Starts · India time"), {
      target: { value: "2026-11-01T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/announcements",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            name: "Next departure",
            message: "New journeys are here.",
            status: "DRAFT",
            startsAt: "2026-11-01T03:30:00.000Z",
            placement: "HOME",
            paths: [],
          }),
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Announcement saved",
    );
  });
  it("sends the saved version when archiving and preserves content", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "ARCHIVED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as archived" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/announcements/one",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({
            version: 4,
            status: "ARCHIVED",
            message: record.message,
          }),
        }),
      ),
    );
  });
  it("blocks a reversed schedule and incomplete links", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Ends · India time (optional)"), {
      target: { value: "2026-09-01T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "end must be later",
    );
    expect(
      vi.mocked(api).mock.calls.filter(([, options]) => options?.method),
    ).toHaveLength(0);
  });
  it("keeps the editor open and reports failed saves", async () => {
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (options?.method)
        throw new Error(
          "The announcement changed. Reload before editing again.",
        );
      return path.includes("/active")
        ? { data: [] }
        : { data: [record], pagination: { total: 1 } };
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload before editing",
    );
    expect(
      screen.getByRole("button", { name: "Save & publish" }),
    ).toBeEnabled();
  });
});
