"use client";

import { useId, useState } from "react";
import { Checkbox, Input, Select } from "./ui";

export type RecordOption = { id: string; label: string };
export function RecordSelect({
  id,
  "aria-describedby": description,
  "aria-invalid": invalid,
  label,
  options,
  value,
  onChange,
  name,
  required = false,
  disabled = false,
  placeholder = "Select a record",
}: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  label: string;
  options: RecordOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const selected = options.find((item) => item.id === value);
  const visible = options.filter((item) =>
    item.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="record-select">
      <Input
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder={`Search ${label.toLowerCase()}…`}
        value={search}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Select
        id={id}
        aria-describedby={description}
        aria-invalid={invalid}
        aria-label={label}
        name={name}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {selected && !visible.some((item) => item.id === value) && (
          <option value={value}>{selected.label}</option>
        )}
        {value && !selected && (
          <option value={value}>Current selection (unavailable)</option>
        )}
        {visible.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </Select>
      {search && !visible.length && (
        <small role="status">
          No matching records. Your current selection is retained.
        </small>
      )}
    </div>
  );
}

export function RecordChecks({
  label,
  options,
  name,
  defaultValues = [],
  value,
  onChange,
  max,
  required = false,
}: {
  label: string;
  options: RecordOption[];
  name: string;
  defaultValues?: string[];
  value?: string[];
  onChange?: (values: string[]) => void;
  max?: number;
  required?: boolean;
}) {
  const [internalValues, setValues] = useState(defaultValues);
  const values = value ?? internalValues;
  const [search, setSearch] = useState("");
  const id = useId();
  return (
    <fieldset className="record-checks" aria-describedby={`${id}-hint`}>
      <legend>{label}</legend>
      <Input
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder={`Search ${label.toLowerCase()}…`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="record-check-options">
        {options
          .filter((item) =>
            item.label.toLowerCase().includes(search.toLowerCase()),
          )
          .map((item) => (
            <label className="checkbox-row" key={item.id}>
              <Checkbox
                checked={values.includes(item.id)}
                disabled={Boolean(
                  max && values.length >= max && !values.includes(item.id),
                )}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...values, item.id]
                    : values.filter((value) => value !== item.id);
                  setValues(next);
                  onChange?.(next);
                }}
              />
              <span>{item.label}</span>
            </label>
          ))}
      </div>
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {required && (
        <input
          className="sr-only"
          tabIndex={-1}
          aria-label={`${label} selection required`}
          required
          value={values.length ? "selected" : ""}
          onChange={() => {}}
        />
      )}
      <small id={`${id}-hint`}>
        {values.length} selected{max ? ` · Maximum ${max}` : ""}
      </small>
      {!options.length && <small>No available records.</small>}
    </fieldset>
  );
}
