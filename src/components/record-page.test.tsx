// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RecordPage } from "./record-page";
import type { RecordView } from "@/lib/routes";

const navigation = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.search,
}));
vi.mock("./core-screen", () => ({
  CoreScreen: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./core-app", () => ({
  CoreApp: ({ view, id }: { view: string; id: string }) => {
    const [draft, setDraft] = useState("");
    return (
      <div>
        <p>
          {view}:{id}
        </p>
        <input
          aria-label="Draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    );
  },
}));
vi.mock("@/features/masters/guest-activity", () => ({
  GuestActivity: ({ id }: { id: string }) => <p>guest-activity:{id}</p>,
}));
afterEach(cleanup);

it.each<RecordView>([
  "invoice-detail",
  "invoice-edit",
  "commercial-detail",
  "customer-statement",
  "guest-activity",
])("opens %s from a query-string ID", (view) => {
  navigation.search = new URLSearchParams("id=record-1");
  render(<RecordPage view={view} />);
  expect(screen.getByText(`${view}:record-1`)).toBeInTheDocument();
});
it.each([
  "",
  "id=",
  "id=%20",
  "id=one&id=two",
  "id=one%2Ftwo",
  "id=%00",
  "id=" + "a".repeat(201),
])("rejects invalid record query %s", (query) => {
  navigation.search = new URLSearchParams(query);
  render(<RecordPage view="invoice-edit" />);
  expect(
    screen.getByRole("heading", { name: "Choose a record to open" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/invoices");
  expect(screen.queryByLabelText("Draft")).not.toBeInTheDocument();
});
it("resets unsaved record state when navigation selects a different ID", () => {
  navigation.search = new URLSearchParams("id=one");
  const page = render(<RecordPage view="invoice-edit" />);
  fireEvent.change(screen.getByLabelText("Draft"), {
    target: { value: "unsaved" },
  });
  navigation.search = new URLSearchParams("id=two");
  page.rerender(<RecordPage view="invoice-edit" />);
  expect(screen.getByText("invoice-edit:two")).toBeInTheDocument();
  expect(screen.getByLabelText("Draft")).toHaveValue("");
});
