import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { humanize, selectReportParams, validRange } from "./report-shared";

describe("report query boundary", () => {
  it("forwards only supported filters and an allow-listed sort", () => {
    expect(
      selectReportParams(
        {
          customerCategory: "AGENT",
          serviceCategoryId: "service-1",
          sortBy: "grandTotal",
          sortOrder: "desc",
          unsafe: "ignored",
          page: "4",
          pageSize: "100",
        },
        [
          "customerCategory",
          "serviceCategoryId",
          "sortBy",
          "sortOrder",
          "page",
          "pageSize",
        ],
        ["grandTotal"],
      ),
    ).toEqual({
      customerCategory: "AGENT",
      serviceCategoryId: "service-1",
      sortBy: "grandTotal",
      sortOrder: "desc",
      page: "4",
      pageSize: "100",
    });
  });

  it("drops unknown sorting and clamps pagination", () => {
    expect(
      selectReportParams(
        {
          sortBy: "clientOnly",
          sortOrder: "sideways",
          page: "0",
          pageSize: "500",
        },
        ["sortBy", "sortOrder", "page", "pageSize"],
        ["invoiceDate"],
      ),
    ).toEqual({ page: "1", pageSize: "25" });
  });

  it("rejects reversed inclusive date ranges before fetching", () => {
    expect(validRange({ from: "2026-04-02", to: "2026-04-01" })).toBe(false);
    expect(validRange({ from: "2026-04-01", to: "2026-04-01" })).toBe(true);
  });

  it("keeps backend constants readable without losing their meaning", () => {
    expect(humanize("SETTLEMENT_DISCOUNT")).toBe("Settlement discount");
    expect(humanize("NO_DUE_DATE")).toBe("No due date");
  });

  it("defines print-only landscape report layout and pagination safeguards", () => {
    const css = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain("@page report-landscape");
    expect(css).toContain("size: A4 landscape");
    expect(css).toContain("body.report-printing > :not(.print-report)");
    expect(css).toContain("display: table-header-group");
    expect(css).toContain("page-break-inside: avoid");
    expect(css).toMatch(/\.print-report\s*\{\s*display: none;/);
  });

  it("pairs every report CSV export with an authorized print action", () => {
    const reportDirectory = new URL("./", import.meta.url);
    const reportFiles = readdirSync(reportDirectory).filter((name) =>
      name.endsWith("-page.tsx"),
    );
    const exportScreens = reportFiles
      .map((name) => ({
        name,
        source: readFileSync(new URL(name, reportDirectory), "utf8"),
      }))
      .filter(({ source }) => source.includes("<ExportCsv"));

    expect(exportScreens.map(({ name }) => name).sort()).toEqual([
      "audit-page.tsx",
      "customer-statement-page.tsx",
      "invoice-register-page.tsx",
      "payments-received-page.tsx",
      "receivables-page.tsx",
      "settlement-discounts-page.tsx",
      "tax-report-page.tsx",
      "vehicle-invoices-page.tsx",
    ]);
    exportScreens.forEach(({ source }) => {
      expect(source).toContain("<PrintReportAction");
      expect(source).toContain("authorized={canPrint}");
      expect(source).toContain("reportBusy=");
    });
  });
});
