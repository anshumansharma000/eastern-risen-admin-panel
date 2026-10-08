import type { Capability } from "@/lib/permissions";

export type FieldOption = { value: string; label: string };
export type FieldRelationship = {
  resource: string;
  displayKey: string;
  placeholder: string;
  multipleOnCreate?: boolean;
};
export type FieldConfig = {
  key: string;
  label: string;
  required?: boolean;
  type?:
    | "text"
    | "tel"
    | "email"
    | "date"
    | "money"
    | "textarea"
    | "select"
    | "checkbox"
    | "relationship";
  options?: FieldOption[];
  relationship?: FieldRelationship;
  hint?: string;
};
export type MasterConfig = {
  resource: string;
  singular: string;
  title: string;
  eyebrow: string;
  description: string;
  capability: Capability;
  fields: FieldConfig[];
  columns: string[];
  labels?: Record<string, string>;
  customerFilters?: boolean;
};
const contact: FieldConfig[] = [
  "address",
  "city",
  "state",
  "country",
  "postalCode",
  "phone",
  "mobileNumber",
  "email",
  "contactPerson",
].map((key) => ({
  key,
  label:
    (
      {
        postalCode: "Postal code",
        mobileNumber: "Mobile number",
        contactPerson: "Contact person",
      } as Record<string, string>
    )[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
  type:
    key === "email"
      ? "email"
      : key === "address"
        ? "textarea"
        : key === "mobileNumber" || key === "phone"
          ? "tel"
          : "text",
  hint:
    key === "mobileNumber"
      ? "Include the country code, for example +441234567890."
      : undefined,
}));
const market: FieldConfig = {
  key: "market",
  label: "Market",
  type: "select",
  options: [
    { value: "", label: "Not specified" },
    { value: "DOMESTIC", label: "Domestic" },
    { value: "INTERNATIONAL", label: "International" },
  ],
};

export const configs: Record<string, MasterConfig> = {
  customers: {
    resource: "customers",
    singular: "customer",
    title: "Billing customers",
    eyebrow: "Master directory",
    description:
      "The parties responsible for invoice payment across agent, leisure, and corporate accounts.",
    capability: "writeOperational",
    customerFilters: true,
    columns: ["name", "category", "contactPerson", "city", "market"],
    fields: [
      { key: "name", label: "Customer name", required: true },
      {
        key: "category",
        label: "Category",
        required: true,
        type: "select",
        options: ["AGENT", "LEISURE", "CORPORATE"].map((value) => ({
          value,
          label: value.charAt(0) + value.slice(1).toLowerCase(),
        })),
      },
      ...contact,
      { key: "pan", label: "PAN" },
      { key: "serviceTaxNumber", label: "Service tax number" },
      { key: "gstNumber", label: "GST number" },
      market,
    ],
  },
  guests: {
    resource: "guests",
    singular: "guest",
    title: "Travellers & guests",
    eyebrow: "Traveller registry",
    description:
      "Structured traveller records, kept separate from free-text group descriptions on invoices.",
    capability: "writeOperational",
    columns: [
      "name",
      "contactPerson",
      "city",
      "market",
      "legacyLastServiceAvailed",
    ],
    fields: [
      { key: "name", label: "Traveller / guest name", required: true },
      ...contact,
      market,
      {
        key: "legacyLastServiceAvailed",
        label: "Historical last service",
        type: "textarea",
        hint: "Imported information only; this does not create activity.",
      },
      {
        key: "legacyLastAmountPaid",
        label: "Historical last amount paid",
        type: "money",
        hint: "Imported information only; this is not a receipt.",
      },
    ],
  },
  hotels: {
    resource: "hotels",
    singular: "hotel",
    title: "Hotels & plan rates",
    eyebrow: "Accommodation masters",
    description:
      "Hotel contacts and reference rates. Rates are never priced into an invoice automatically.",
    capability: "writeOperational",
    columns: ["name", "city", "state", "phone", "market"],
    fields: [
      { key: "name", label: "Hotel name", required: true },
      ...contact,
      market,
    ],
  },
  "hotel-rates": {
    resource: "hotel-rates",
    singular: "hotel rate",
    title: "Hotel plan rates",
    eyebrow: "Commercial references",
    description: "INR reference rates with optional effective periods.",
    capability: "writeOperational",
    columns: ["name", "hotelId", "plan", "amount", "effectiveTo"],
    fields: [
      {
        key: "hotelId",
        label: "Hotel",
        required: true,
        type: "relationship",
        relationship: {
          resource: "hotels",
          displayKey: "name",
          placeholder: "Select hotel",
        },
      },
      { key: "name", label: "Rate name", required: true },
      {
        key: "plan",
        label: "Plan",
        required: true,
        type: "select",
        options: ["APAI", "MAPAI", "CPAI"].map((value) => ({
          value,
          label: (
            {
              APAI: "APAI · All meals included",
              MAPAI: "MAPAI · Breakfast and one meal",
              CPAI: "CPAI · Breakfast included",
            } as Record<string, string>
          )[value],
        })),
      },
      { key: "amount", label: "Amount (INR)", required: true, type: "money" },
      {
        key: "currency",
        label: "Currency",
        required: true,
        type: "select",
        options: [{ value: "INR", label: "INR" }],
      },
      { key: "effectiveFrom", label: "Effective from", type: "date" },
      { key: "effectiveTo", label: "Effective to", type: "date" },
    ],
  },
  companies: {
    resource: "companies",
    singular: "company",
    title: "Issuing companies",
    eyebrow: "Legal billing entities",
    description:
      "Legal identities and invoice footer details used at issuance and preserved in immutable snapshots.",
    capability: "writeConfiguration",
    columns: ["name", "state", "country", "gstNumber", "email"],
    fields: [
      { key: "name", label: "Legal company name", required: true },
      {
        key: "address",
        label: "Registered address",
        type: "textarea",
        hint: "Address, state, and country are required before issuing a new invoice.",
      },
      {
        key: "state",
        label: "State",
        hint: "Required before invoice issuance.",
      },
      {
        key: "country",
        label: "Country",
        hint: "Required before invoice issuance.",
      },
      { key: "postalCode", label: "Postal code" },
      { key: "phone", label: "Phone" },
      { key: "mobileNumber", label: "Mobile number" },
      { key: "email", label: "Email", type: "email" },
      { key: "pan", label: "PAN" },
      { key: "serviceTaxNumber", label: "Service tax number" },
      { key: "cin", label: "CIN" },
      { key: "gstNumber", label: "GST number" },
      { key: "website", label: "Website" },
      { key: "branchOffice", label: "Branch office" },
      {
        key: "paymentInstructions",
        label: "Payment instructions",
        type: "textarea",
      },
      { key: "footerNotes", label: "Invoice footer notes", type: "textarea" },
    ],
  },
  "bank-accounts": {
    resource: "bank-accounts",
    singular: "bank account",
    title: "Bank accounts",
    eyebrow: "Payment destinations",
    description:
      "Company-owned payment destinations. Account numbers remain text and preserve leading zeroes.",
    capability: "writeConfiguration",
    columns: ["name", "companyId", "accountNumber", "branch", "ifscCode"],
    fields: [
      {
        key: "companyId",
        label: "Company",
        required: true,
        type: "relationship",
        relationship: {
          resource: "companies",
          displayKey: "name",
          placeholder: "Select company",
        },
      },
      { key: "name", label: "Bank name", required: true },
      { key: "accountNumber", label: "Account number", required: true },
      { key: "branch", label: "Branch" },
      { key: "ifscCode", label: "IFSC code" },
      { key: "swiftCode", label: "SWIFT code" },
    ],
  },
  "service-categories": {
    resource: "service-categories",
    singular: "service category",
    title: "Service categories",
    eyebrow: "Invoice classification",
    description: "Invoice-wide service labels and HSN/SAC classification text.",
    capability: "writeConfiguration",
    columns: ["name", "code", "requiresVehicle", "updatedAt"],
    fields: [
      { key: "name", label: "Service name", required: true },
      { key: "code", label: "HSN / SAC code", required: true },
      {
        key: "requiresVehicle",
        label: "Requires vehicle",
        type: "checkbox",
        hint: "Require an active vehicle on invoices in this category.",
      },
    ],
  },
  "tax-rules": {
    resource: "tax-rules",
    singular: "tax rule",
    title: "Tax rules & effective rates",
    eyebrow: "Fiscal configuration",
    description:
      "Effective-dated component rates. Rates are applied automatically when calculating invoices.",
    capability: "writeConfiguration",
    columns: [
      "name",
      "component",
      "serviceCategoryId",
      "rate",
      "effectiveFrom",
      "effectiveTo",
    ],
    fields: [
      { key: "name", label: "Rule name", required: true },
      {
        key: "component",
        label: "Component",
        required: true,
        type: "select",
        options: ["IGST", "CGST", "SGST", "SERVICE_TAX"].map((value) => ({
          value,
          label: value === "SERVICE_TAX" ? "Legacy service tax" : value,
        })),
      },
      {
        key: "serviceCategoryId",
        label: "Service categories",
        type: "relationship",
        relationship: {
          resource: "service-categories",
          displayKey: "name",
          placeholder: "All service categories",
          multipleOnCreate: true,
        },
        hint: "Choose categories to create a rule for each. Leave all unchecked to apply one rule to all services.",
      },
      { key: "rate", label: "Rate (%)", required: true },
      {
        key: "effectiveFrom",
        label: "Effective from",
        required: true,
        type: "date",
      },
      { key: "effectiveTo", label: "Effective to", type: "date" },
    ],
  },
  "vendor-profiles": {
    resource: "vendor-profiles",
    singular: "vendor profile",
    title: "Vendor Core profiles",
    eyebrow: "Additional Core details",
    description: "Address and market details for each vendor.",
    capability: "writeOperational",
    columns: ["vendorId", "city", "state", "country", "market"],
    fields: [
      {
        key: "vendorId",
        label: "Vendor",
        required: true,
        type: "relationship",
        relationship: {
          resource: "vendors",
          displayKey: "name",
          placeholder: "Select vendor",
        },
        hint: "This ownership link should not be changed casually after creation.",
      },
      { key: "address", label: "Address", type: "textarea" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "country", label: "Country" },
      { key: "postalCode", label: "Postal code" },
      { key: "mobileNumber", label: "Mobile number" },
      market,
    ],
  },
};
