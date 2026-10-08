import { getCollection } from "./api/client";
import type { Collection } from "./api/contracts";

// Until the API supports search on every directory, resolve every page rather
// than silently omitting records after the first 100.
export async function getAllRecords<T extends { id: string }>(
  path: string,
  signal?: AbortSignal,
  fetchPage: typeof getCollection = getCollection,
): Promise<Collection<T>> {
  const first = await fetchPage<T>(path, signal);
  const records = new Map(first.data.map((record) => [record.id, record]));
  let page = first.pagination.page;
  let total = first.pagination.total;
  while (records.size < total) {
    signal?.throwIfAborted();
    const url = new URL(path, "http://local.invalid");
    url.searchParams.set("page", String(++page));
    const next = await fetchPage<T>(`${url.pathname}${url.search}`, signal);
    const previousCount = records.size;
    next.data.forEach((record) => records.set(record.id, record));
    total = next.pagination.total;
    if (records.size === previousCount && records.size < total)
      throw new Error(
        "The directory changed while loading. Try again to load all available records.",
      );
  }
  return {
    data: [...records.values()],
    pagination: { page: 1, pageSize: records.size || 100, total: records.size },
  };
}
