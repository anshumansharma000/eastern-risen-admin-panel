import { describe, expect, it } from "vitest";
import { formatINR, moneyToPaise, normalizeMoney } from "./money";

describe("exact INR handling", () => {
  it("normalises convenient input without floating point", () => {
    expect(normalizeMoney("1000")).toBe("1000.00");
    expect(normalizeMoney("1000.5")).toBe("1000.50");
    expect(moneyToPaise("81500.00")).toBe(BigInt(8_150_000));
  });

  it("rejects negative, exponent, and excess precision", () => {
    expect(normalizeMoney("-1")).toBeNull();
    expect(normalizeMoney("1e3")).toBeNull();
    expect(normalizeMoney("1.005")).toBeNull();
    expect(normalizeMoney("1000000000000.00")).toBeNull();
  });

  it("uses Indian grouping at the supported limit", () => {
    expect(formatINR("123456789012.34")).toBe("₹1,23,45,67,89,012.34");
  });
});
