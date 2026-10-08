// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFormGuard } from "./form-guard";
import { Field, Input, Modal } from "./ui";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Guarded({ saving = false }: { saving?: boolean }) {
  useFormGuard(true, saving);
  // A raw anchor exercises the document-level guard independently of Next routing.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a href="/invoices">Leave</a>;
}
it("keeps unsaved work when navigation is rejected", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Guarded />);
  expect(fireEvent.click(screen.getByText("Leave"))).toBe(false);
  expect(confirm).toHaveBeenCalledTimes(1);
});
it("blocks navigation while saving without a discard prompt", () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<Guarded saving />);
  expect(fireEvent.click(screen.getByText("Leave"))).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});
it("warns on refresh and removes the guard after unmount", () => {
  const view = render(<Guarded />);
  const before = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(true);
  view.unmount();
  const after = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
it("protects a changed drawer from Escape and disables inputs while saving", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const close = vi.fn();
  const view = render(
    <Modal title="Edit record" onClose={close}>
      <form>
        <Field label="Name">
          <Input />
        </Field>
      </form>
    </Modal>,
  );
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Changed" },
  });
  fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  view.rerender(
    <Modal title="Edit record" closeDisabled onClose={close}>
      <form>
        <Field label="Name">
          <Input />
        </Field>
      </form>
    </Modal>,
  );
  expect(screen.getByLabelText("Name")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Close dialog"));
  expect(close).not.toHaveBeenCalled();
});
it("links field errors to the input", () => {
  render(
    <Field label="Name" error="Enter a name">
      <Input />
    </Field>,
  );
  expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
    "Enter a name",
  );
});
