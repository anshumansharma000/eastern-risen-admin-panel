// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { RecordChecks, RecordSelect } from "./record-select";
afterEach(cleanup);
it("retains selections while searching another option", () => {
  function Picker() {
    const [value, setValue] = useState("a");
    return (
      <RecordSelect
        label="Customer"
        options={[
          { id: "a", label: "Asha" },
          { id: "b", label: "Bina" },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }
  render(<Picker />);
  fireEvent.change(screen.getByLabelText("Search customer"), {
    target: { value: "Bina" },
  });
  expect(screen.getByLabelText("Customer")).toHaveValue("a");
  expect(screen.getByRole("option", { name: "Asha" })).toBeInTheDocument();
});
it("submits checked selections even when filtered out", () => {
  const { container } = render(
    <form>
      <RecordChecks
        label="Banks"
        name="bankAccountIds"
        options={[
          { id: "a", label: "Bank A" },
          { id: "b", label: "Bank B" },
        ]}
        max={1}
      />
    </form>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Bank A" }));
  expect(screen.getByRole("checkbox", { name: "Bank B" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search banks"), {
    target: { value: "Bank B" },
  });
  expect(
    new FormData(container.querySelector("form")!).getAll("bankAccountIds"),
  ).toEqual(["a"]);
});
