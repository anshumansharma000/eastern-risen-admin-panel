import { describe, expect, it } from "vitest";
import { can, canManageVehicleLifecycle, isCoreRole } from "./permissions";

describe("Core permissions", () => {
  it("keeps report viewers read-only", () => {
    expect(can("CORE_REPORT_VIEWER", "read")).toBe(true);
    expect(can("CORE_REPORT_VIEWER", "billing")).toBe(false);
    expect(can("CORE_REPORT_VIEWER", "writeOperational")).toBe(false);
  });
  it("does not accept feedback roles", () => {
    expect(isCoreRole("ADMIN")).toBe(false);
    expect(isCoreRole("DRIVER")).toBe(false);
  });
  it("reserves vehicle lifecycle controls for administrators", () => {
    expect(canManageVehicleLifecycle("CORE_ADMIN")).toBe(true);
    expect(canManageVehicleLifecycle("CORE_DATA_ENTRY")).toBe(false);
    expect(canManageVehicleLifecycle("CORE_REPORT_VIEWER")).toBe(false);
  });
});
