import { describe, expect, it } from "vitest";
import { latestAccepted, scheduleError, statusReason } from "./rules";
import type { BookingDetail } from "./api";

const detail: BookingDetail = {
  booking: {
    id: "b",
    reference: "R",
    companyId: "c",
    customerId: "u",
    serviceCategoryId: "s",
    title: "Tour",
    status: "QUOTED",
    serviceStartsOn: null,
    serviceEndsOn: null,
  },
  quotes: [
    {
      id: "q2",
      version: 2,
      description: "",
      inclusions: "",
      exclusions: "",
      terms: "",
      total: "100.00",
      expiresOn: null,
      acceptedAt: null,
    },
    {
      id: "q1",
      version: 1,
      description: "",
      inclusions: "",
      exclusions: "",
      terms: "",
      total: "90.00",
      expiresOn: null,
      acceptedAt: "2026-01-01T00:00:00Z",
    },
  ],
  milestones: [],
  orders: [],
  invoice: null,
};
describe("commercial workflow rules", () => {
  it("does not attribute an old acceptance to a new quote", () => {
    expect(latestAccepted(detail)).toBeNull();
  });
  it("checks custom schedule dates and exact paise sums", () => {
    expect(
      scheduleError(
        [
          { label: "A", amount: "30.00", dueOn: "2026-09-28" },
          { label: "B", amount: "70.00", dueOn: "2026-10-01" },
        ],
        "100.00",
        "2026-09-28",
      ),
    ).toBeNull();
    expect(
      scheduleError(
        [{ label: "A", amount: "30.00", dueOn: "2026-09-28" }],
        "100.00",
        "2026-09-28",
      ),
    ).toMatch(/exactly/);
    expect(
      scheduleError(
        [{ label: "A", amount: "100.00", dueOn: "2026-09-27" }],
        "100.00",
        "2026-09-28",
      ),
    ).toMatch(/due date/);
  });
  it("gates confirmation on an invoice, schedule, and first paid milestone", () => {
    expect(statusReason(detail, "CONFIRMED")).toMatch(/invoice/);
    const invoiced = {
      ...detail,
      invoice: {
        id: "i",
        status: "ISSUED",
        grandTotal: "100.00",
      } as BookingDetail["invoice"],
    };
    expect(statusReason(invoiced, "CONFIRMED")).toMatch(/schedule/);
    expect(
      statusReason(
        {
          ...invoiced,
          milestones: [
            {
              id: "m",
              label: "A",
              amount: "30.00",
              dueOn: "2026-09-28",
              remainingAmount: "30.00",
            },
          ],
        },
        "CONFIRMED",
      ),
    ).toMatch(/initial/);
    expect(
      statusReason(
        {
          ...invoiced,
          milestones: [
            {
              id: "m",
              label: "A",
              amount: "30.00",
              dueOn: "2026-09-28",
              remainingAmount: "0.00",
            },
          ],
        },
        "CONFIRMED",
      ),
    ).toBeNull();
  });
});
