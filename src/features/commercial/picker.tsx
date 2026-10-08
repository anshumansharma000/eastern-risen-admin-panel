"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState, Field, Input, Select } from "@/components/ui";
import { getResource, safeId } from "@/lib/api/client";
import { commercialApi, type PickerItem } from "./api";

export function MasterPicker({
  resource,
  label,
  value,
  onChange,
  filter,
  required = true,
  error,
}: {
  resource: string;
  label: string;
  value: string;
  onChange: (id: string, item?: PickerItem) => void;
  filter?: (item: PickerItem) => boolean;
  required?: boolean;
  error?: string;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["commercial-picker", resource, page, q],
    queryFn: ({ signal }) => commercialApi.picker(resource, page, q, signal),
  });
  const items = (query.data?.data ?? []).filter(
    (item) => !filter || filter(item),
  );
  const selected = useQuery({
    queryKey: [resource, value, "picker-selected"],
    queryFn: ({ signal }) =>
      getResource<PickerItem>(`/${resource}/${safeId(value)}`, signal),
    enabled: Boolean(value && !items.some((item) => item.id === value)),
    staleTime: 60_000,
  });
  const visible = items;
  return (
    <Field label={label} error={error}>
      <div className="commercial-picker">
        {
          <Input
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}…`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        }
        <Select
          aria-label={label}
          required={required}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value,
              items.find((i) => i.id === e.target.value),
            )
          }
          disabled={query.isLoading}
        >
          <option value="">
            {query.isLoading ? "Loading…" : `Select ${label.toLowerCase()}`}
          </option>
          {value && !items.some((i) => i.id === value) && (
            <option value={value}>
              {selected.data?.data.name ?? "Current selection"}
            </option>
          )}
          {visible.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.category ? ` · ${item.category}` : ""}
            </option>
          ))}
        </Select>
        {query.isError && (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        )}
        {query.data && query.data.pagination.total > 100 && (
          <div className="commercial-picker-nav">
            <small>
              {query.data.pagination.total} active records · page {page}
            </small>
            <div>
              <Button
                type="button"
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={page * 100 >= query.data.pagination.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}
