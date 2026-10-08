import { describe, expect, it, vi } from "vitest";
import { getAllRecords } from "./all-records";
import type { getCollection } from "./api/client";

describe("complete record directories", () => {
  it("loads later pages without omitting records beyond 100", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        data: first,
        pagination: { page: 1, pageSize: 100, total: 101 },
      })
      .mockResolvedValueOnce({
        data: [{ id: "100" }],
        pagination: { page: 2, pageSize: 100, total: 101 },
      });
    const result = await getAllRecords(
      "/customers?page=1&pageSize=100&status=ACTIVE",
      undefined,
      loader as typeof getCollection,
    );
    expect(result.data).toHaveLength(101);
    expect(loader.mock.calls[1][0]).toBe(
      "/customers?page=2&pageSize=100&status=ACTIVE",
    );
  });
  it("reports an incomplete directory rather than silently accepting repeated pages", async () => {
    const loader = vi.fn().mockResolvedValue({
      data: [{ id: "a" }],
      pagination: { page: 1, pageSize: 100, total: 101 },
    });
    await expect(
      getAllRecords(
        "/companies?page=1&pageSize=100",
        undefined,
        loader as typeof getCollection,
      ),
    ).rejects.toThrow("directory changed");
  });
  it("honors cancellation before fetching more pages", async () => {
    const controller = new AbortController();
    controller.abort();
    const loader = vi.fn().mockResolvedValue({
      data: [{ id: "a" }],
      pagination: { page: 1, pageSize: 100, total: 101 },
    });
    await expect(
      getAllRecords(
        "/companies?page=1&pageSize=100",
        controller.signal,
        loader as typeof getCollection,
      ),
    ).rejects.toThrow();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
