// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { commercialApi } from "./api";
import { QuoteComposer } from "./quote-composer";
import {
  acceptedQuote,
  billingBooking,
  calculated,
} from "./billing-fixtures.test-helper";
vi.mock("./api", () => ({
  commercialApi: { calculateQuote: vi.fn(), quote: vi.fn() },
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(commercialApi.calculateQuote).mockResolvedValue({
    data: calculated,
  });
  vi.mocked(commercialApi.quote).mockResolvedValue({ data: acceptedQuote });
});
function fill() {
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Transport scope" },
  });
  fireEvent.change(screen.getByLabelText("Payment and cancellation terms"), {
    target: { value: "Agreed terms" },
  });
  fireEvent.change(screen.getByLabelText("Line 1 description"), {
    target: { value: "Transport" },
  });
  fireEvent.change(screen.getByLabelText("Line 1 amount (INR)"), {
    target: { value: "100" },
  });
}
it("reviews authoritative taxes and plan, normalizes amounts and renders the persisted quote via onSaved", async () => {
  const saved = vi.fn();
  render(<QuoteComposer booking={billingBooking} onSaved={saved} />);
  fill();
  expect(
    screen.getByRole("button", { name: "Create new quote version" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  expect(await screen.findByText("Grand total ₹105.00")).toBeInTheDocument();
  expect(screen.getByText(/IGST 5%/)).toBeInTheDocument();
  expect(screen.getByText(/Past agreed due date/)).toBeInTheDocument();
  expect(commercialApi.calculateQuote).toHaveBeenCalledWith(
    "booking",
    expect.objectContaining({
      lines: [
        {
          description: "Transport",
          amount: "100.00",
          taxTreatment: "TAXABLE",
          taxComponents: ["IGST"],
        },
      ],
      paymentPlan: { mode: "COMPANY_DEFAULT" },
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create new quote version" }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledWith(acceptedQuote));
  expect(commercialApi.quote).toHaveBeenCalledWith(
    "booking",
    expect.objectContaining({
      description: "Transport scope",
      terms: "Agreed terms",
      paymentPlan: { mode: "COMPANY_DEFAULT" },
    }),
  );
  expect(vi.mocked(commercialApi.quote).mock.calls[0][1]).not.toHaveProperty(
    "total",
  );
  const toggle = screen.getByText("Create quote");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(toggle);
  expect(toggle.closest("details")).toHaveAttribute("open");
  expect(screen.getByLabelText("Description")).toHaveValue("");
  expect(screen.getByLabelText("Payment and cancellation terms")).toHaveValue(
    "",
  );
  expect(screen.getByLabelText("Line 1 description")).toHaveValue("");
  expect(screen.getByLabelText("Line 1 amount (INR)")).toHaveValue("");
  expect(screen.queryByText("Grand total ₹105.00")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create new quote version" }),
  ).toBeDisabled();
});
it("invalidates the preview on edits and ignores an old request resolving later", async () => {
  let resolve!: (value: { data: typeof calculated }) => void;
  vi.mocked(commercialApi.calculateQuote).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<QuoteComposer booking={billingBooking} onSaved={vi.fn()} />);
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  fireEvent.change(screen.getByLabelText("Line 1 amount (INR)"), {
    target: { value: "200.00" },
  });
  await act(async () => resolve({ data: calculated }));
  expect(screen.queryByText("Grand total ₹105.00")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create new quote version" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  await screen.findByText("Grand total ₹105.00");
  fireEvent.change(screen.getByLabelText("Payment and cancellation terms"), {
    target: { value: "New terms" },
  });
  expect(
    screen.getByRole("button", { name: "Create new quote version" }),
  ).toBeDisabled();
});
it("offers custom milestones when the service date is missing and rejects invalid money/dates", async () => {
  render(
    <QuoteComposer
      booking={{ ...billingBooking, serviceStartsOn: null }}
      onSaved={vi.fn()}
    />,
  );
  fill();
  expect(
    screen.getByRole("option", { name: "Company default" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Payment 1 amount (INR)"), {
    target: { value: "0.001" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("positive amount");
  expect(commercialApi.calculateQuote).not.toHaveBeenCalled();
});
it("sends paired GST components and removes components from non-taxable lines", async () => {
  render(<QuoteComposer booking={billingBooking} onSaved={vi.fn()} />);
  fill();
  fireEvent.change(screen.getByLabelText("Line 1 GST components"), {
    target: { value: "CGST_SGST" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  await waitFor(() =>
    expect(commercialApi.calculateQuote).toHaveBeenCalledWith(
      "booking",
      expect.objectContaining({
        lines: [expect.objectContaining({ taxComponents: ["CGST", "SGST"] })],
      }),
    ),
  );
  fireEvent.change(screen.getByLabelText("Line 1 tax treatment"), {
    target: { value: "EXEMPT" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  await waitFor(() =>
    expect(commercialApi.calculateQuote).toHaveBeenLastCalledWith(
      "booking",
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            taxTreatment: "EXEMPT",
            taxComponents: [],
          }),
        ],
      }),
    ),
  );
});

it("validates custom milestone sums with exact paise and sends normalized decimal text", async () => {
  vi.mocked(commercialApi.calculateQuote).mockResolvedValue({
    data: {
      ...calculated,
      pricing: { ...calculated.pricing, grandTotal: "0.30" },
      proposedPlan: {
        ...calculated.proposedPlan,
        mode: "CUSTOM",
        policy: null,
        milestones: [
          { label: "Initial payment", amount: "0.30", dueOn: "2099-01-01" },
        ],
      },
    },
  });
  render(
    <QuoteComposer
      booking={{ ...billingBooking, serviceStartsOn: null }}
      onSaved={vi.fn()}
    />,
  );
  fill();
  fireEvent.change(screen.getByLabelText("Payment 1 amount (INR)"), {
    target: { value: "0.1" },
  });
  fireEvent.change(screen.getByLabelText("Payment 1 due on"), {
    target: { value: "2099-01-01" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add payment milestone" }),
  );
  fireEvent.change(screen.getByLabelText("Payment 2 label"), {
    target: { value: "Balance" },
  });
  fireEvent.change(screen.getByLabelText("Payment 2 amount (INR)"), {
    target: { value: "0.2" },
  });
  fireEvent.change(screen.getByLabelText("Payment 2 due on"), {
    target: { value: "2099-01-01" },
  });
  expect(screen.getByText("Milestone total: ₹0.30")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  await screen.findByText("Grand total ₹0.30");
  expect(
    screen.getByRole("button", { name: "Create new quote version" }),
  ).toBeEnabled();
  expect(commercialApi.calculateQuote).toHaveBeenCalledWith(
    "booking",
    expect.objectContaining({
      paymentPlan: {
        mode: "CUSTOM",
        milestones: [
          { label: "Initial payment", amount: "0.10", dueOn: "2099-01-01" },
          { label: "Balance", amount: "0.20", dueOn: "2099-01-01" },
        ],
      },
    }),
  );
  fireEvent.change(screen.getByLabelText("Payment 2 amount (INR)"), {
    target: { value: "0.21" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate and review quote" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("exactly equal");
  expect(
    screen.getByRole("button", { name: "Create new quote version" }),
  ).toBeDisabled();
});
