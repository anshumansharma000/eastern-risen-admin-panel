"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiFieldError } from "@/lib/api/client";
import type { CoreMaster, Resource } from "@/lib/api/contracts";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
} from "@/components/ui";

export function CustomerCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: CoreMaster) => void;
}) {
  const cache = useQueryClient();
  const [error, setError] = useState<unknown>();
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Resource<CoreMaster>>("/customers", { method: "POST", body }),
    onSuccess: async (result) => {
      await cache.invalidateQueries({ queryKey: ["customers"] });
      await cache.invalidateQueries({
        queryKey: ["commercial-picker", "customers"],
      });
      onCreated(result.data);
    },
    onError: setError,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = new FormData(event.currentTarget);
    create.mutate({
      name: String(form.get("name")).trim(),
      category: form.get("category"),
      mobileNumber: String(form.get("mobileNumber") ?? "").trim() || null,
      email: String(form.get("email") ?? "").trim() || null,
      status: "ACTIVE",
    });
  }
  return (
    <Modal
      title="Create customer"
      subtitle="Your invoice or booking stays open. Add other details later in Customers."
      closeDisabled={create.isPending}
      onClose={onClose}
    >
      <form className="record-form" onSubmit={submit}>
        <Field label="Customer name" error={apiFieldError(error, "name")}>
          <Input name="name" required maxLength={200} />
        </Field>
        <Field label="Category">
          <Select name="category">
            <option value="LEISURE">Leisure</option>
            <option value="AGENT">Agent</option>
            <option value="CORPORATE">Corporate</option>
          </Select>
        </Field>
        <Field
          label="Mobile number"
          hint="Include the country code, for example +441234567890."
          error={apiFieldError(error, "mobileNumber")}
        >
          <Input name="mobileNumber" type="tel" />
        </Field>
        <Field label="Email" error={apiFieldError(error, "email")}>
          <Input name="email" type="email" />
        </Field>
        {Boolean(error) && <ErrorState error={error} />}
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create and select customer"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
