"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Button, ErrorState, Field, Input } from "@/components/ui";
import { apiFieldError } from "@/lib/api/client";
import { MasterPicker } from "./picker";
import { commercialApi } from "./api";
import { useFormGuard } from "@/components/form-guard";
import { CustomerCreateDialog } from "@/features/masters/customer-create-dialog";
import { CustomerLink } from "./customer-link";

export function BookingNew() {
  const [dirty, setDirty] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [serviceCategoryId, setServiceCategoryId] = useState("");
  const [customerHasMobile, setCustomerHasMobile] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const create = useMutation({
    mutationFn: commercialApi.create,
    onSuccess: () => {
      clearGuard();
      setDirty(false);
    },
    onError: setError,
  });
  const clearGuard = useFormGuard(dirty, create.isPending);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const start = String(data.get("serviceStartsOn") || "");
    const end = String(data.get("serviceEndsOn") || "");
    if (start && end && end < start) {
      setError(new Error("End date cannot precede start date."));
      return;
    }
    create.mutate({
      reference: String(data.get("reference") || "").trim(),
      title: String(data.get("title") || "").trim(),
      companyId,
      customerId,
      serviceCategoryId,
      serviceStartsOn: start || null,
      serviceEndsOn: end || null,
    });
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Commercial bookings</p>
          <h1>New booking</h1>
          <p>Create the booking, then copy its private customer link.</p>
        </div>
        <Link className="button button-secondary" href="/commercial-bookings">
          Back to bookings
        </Link>
      </header>
      {create.data ? (
        <section className="commercial-card">
          <h2>Booking created</h2>
          <p>
            Share this private link with the customer. It is shown only now;
            rotate it later if lost.
          </p>
          <CustomerLink token={create.data.data.accessToken} />
          <Link
            className="button button-primary"
            href={`/commercial-bookings/${encodeURIComponent(create.data.data.booking.id)}`}
          >
            Continue to booking
          </Link>
        </section>
      ) : (
        <form
          className="record-form commercial-card"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <Field
            label="Staff reference"
            error={apiFieldError(error, "reference")}
          >
            <Input name="reference" required maxLength={100} />
          </Field>
          <Field
            label="Tour or service title"
            error={apiFieldError(error, "title")}
          >
            <Input name="title" required maxLength={200} />
          </Field>
          <MasterPicker
            resource="companies"
            label="Company"
            value={companyId}
            onChange={setCompanyId}
            error={apiFieldError(error, "companyId")}
          />
          <MasterPicker
            resource="customers"
            label="Customer"
            value={customerId}
            onChange={(id, item) => {
              setCustomerId(id);
              setCustomerHasMobile(hasInternationalMobile(item?.mobileNumber));
            }}
            error={apiFieldError(error, "customerId")}
          />
          <MasterPicker
            resource="service-categories"
            label="Service category"
            value={serviceCategoryId}
            onChange={setServiceCategoryId}
            error={apiFieldError(error, "serviceCategoryId")}
          />
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNewCustomer(true)}
            >
              Create customer
            </Button>
            <p className="muted">
              Use the customer’s mobile number with country code for checkout
              (for example, +441234567890).
            </p>
            {customerId && !customerHasMobile && (
              <p className="muted">
                Add a mobile number with country code before sending the
                customer to checkout.
              </p>
            )}
          </div>
          <Field
            label="Service starts on"
            error={apiFieldError(error, "serviceStartsOn")}
          >
            <Input name="serviceStartsOn" type="date" />
          </Field>
          <Field
            label="Service ends on"
            error={apiFieldError(error, "serviceEndsOn")}
          >
            <Input name="serviceEndsOn" type="date" />
          </Field>
          {Boolean(error) && <ErrorState error={error} />}
          <footer>
            <Button
              disabled={
                create.isPending ||
                !companyId ||
                !customerId ||
                !serviceCategoryId
              }
            >
              {create.isPending ? "Creating…" : "Create booking"}
            </Button>
          </footer>
        </form>
      )}
      {newCustomer && (
        <CustomerCreateDialog
          onClose={() => setNewCustomer(false)}
          onCreated={(customer) => {
            setCustomerId(customer.id);
            setCustomerHasMobile(
              hasInternationalMobile(String(customer.mobileNumber ?? "")),
            );
            setNewCustomer(false);
            setDirty(true);
          }}
        />
      )}
    </>
  );
}

export function hasInternationalMobile(value: string | null | undefined) {
  const compact = value?.replace(/[\s().-]/g, "") ?? "";
  return /^\+[1-9]\d{6,14}$/.test(compact);
}
