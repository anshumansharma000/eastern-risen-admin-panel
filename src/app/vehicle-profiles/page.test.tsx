import { describe, expect, it, vi } from "vitest";
import Page from "./page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

describe("legacy vehicle profiles route", () => {
  it("redirects to vehicles without rendering the removed resource", () => {
    Page();
    expect(redirect).toHaveBeenCalledWith("/vehicles");
  });
});
