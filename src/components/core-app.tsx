"use client";

import { loginHref } from "@/lib/routes";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { useSession } from "./app-providers";
import { Button, ErrorState, Loading } from "./ui";
import { can, isCoreRole } from "@/lib/permissions";
import { Overview } from "./overview";
import { InvoiceList } from "@/features/invoices/invoice-list";
import { InvoiceEditor } from "@/features/invoices/invoice-editor";
import { InvoiceDetail } from "@/features/invoices/invoice-detail";
import { MasterPage } from "@/features/masters/master-page";
import { configs } from "@/features/masters/master-config";
import { CatalogPage } from "@/features/masters/catalog-page";
import { VehiclesPage } from "@/features/vehicles/vehicles-page";
import { ProfilePage } from "@/features/profile/profile-page";
import { ReceivablesPage } from "@/features/reports/receivables-page";
import { InvoiceRegisterPage } from "@/features/reports/invoice-register-page";
import { VehicleInvoicesPage } from "@/features/reports/vehicle-invoices-page";
import { TaxReportPage } from "@/features/reports/tax-report-page";
import { PaymentsReceivedPage } from "@/features/reports/payments-received-page";
import { SettlementDiscountsPage } from "@/features/reports/settlement-discounts-page";
import { CustomerStatementPage } from "@/features/reports/customer-statement-page";
import { AuditPage } from "@/features/reports/audit-page";
import { UsersPage } from "@/features/users/users-page";
import { api } from "@/lib/api/client";
import { BrandLogo } from "./brand-logo";
import { BookingList } from "@/features/commercial/booking-list";
import { BookingNew } from "@/features/commercial/booking-new";
import { BookingDetailPage } from "@/features/commercial/booking-detail";
import { PolicyPage } from "@/features/commercial/policy-page";

export type CoreView =
  | "overview"
  | "invoices"
  | "invoice-new"
  | "invoice-detail"
  | "invoice-edit"
  | "receivables"
  | "invoice-register"
  | "vehicle-invoices"
  | "tax-report"
  | "payments-received"
  | "settlement-discounts"
  | "customer-statement"
  | "audit"
  | "customers"
  | "guests"
  | "hotels"
  | "hotel-rates"
  | "vendors"
  | "vehicles"
  | "companies"
  | "bank-accounts"
  | "service-categories"
  | "tax-rules"
  | "vendor-profiles"
  | "profile"
  | "users"
  | "commercial-bookings"
  | "commercial-new"
  | "commercial-detail"
  | "commercial-policy";
export function CoreApp({ view, id }: { view: CoreView; id?: string }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [logoutError, setLogoutError] = useState<unknown>(null);
  useEffect(() => {
    if (
      session.isError &&
      (session.error as { status?: number }).status === 401
    )
      router.replace(loginHref(pathname));
  }, [session.isError, session.error, router, pathname]);
  if (session.isLoading)
    return (
      <div className="session-screen">
        <BrandLogo className="brand-mark-image large" compact priority />
        <Loading label="Verifying your Core session" />
      </div>
    );
  if (session.isError && (session.error as { status?: number }).status !== 401)
    return (
      <div className="session-screen">
        <ErrorState
          error={session.error}
          onRetry={() => void session.refetch()}
        />
      </div>
    );
  if (!session.user)
    return (
      <div className="session-screen">
        <p>Redirecting to sign in…</p>
      </div>
    );
  if (!isCoreRole(session.user.role))
    return (
      <main className="access-denied">
        <BrandLogo className="brand-mark-image large" compact priority />
        <p className="eyebrow">Core access required</p>
        <h1>This account is not assigned to Core.</h1>
        <p>
          Your current role belongs to another Eastern Risen application. Sign
          out and use a Core staff account.
        </p>
        <Button
          onClick={async () => {
            setLogoutError(null);
            try {
              await api("/api/v1/auth/logout", { core: false, method: "POST" });
              router.replace("/login");
            } catch (error) {
              setLogoutError(error);
            }
          }}
        >
          Sign out
        </Button>
        {Boolean(logoutError) && <ErrorState error={logoutError} />}
      </main>
    );
  const role = session.user.role;
  let content = <Overview role={role} />;
  if (view === "invoices") content = <InvoiceList role={role} />;
  else if (view === "invoice-new")
    content = role === "CORE_REPORT_VIEWER" ? <Forbidden /> : <InvoiceEditor />;
  else if (view === "invoice-edit")
    content =
      role === "CORE_REPORT_VIEWER" ? <Forbidden /> : <InvoiceEditor id={id} />;
  else if (view === "invoice-detail" && id)
    content = <InvoiceDetail id={id} role={role} />;
  else if (view === "commercial-bookings")
    content = <BookingList role={role} />;
  else if (view === "commercial-new")
    content = role === "CORE_REPORT_VIEWER" ? <Forbidden /> : <BookingNew />;
  else if (view === "commercial-detail" && id)
    content = <BookingDetailPage id={id} role={role} />;
  else if (view === "commercial-policy") content = <PolicyPage role={role} />;
  else if (view === "receivables")
    content = <ReceivablesPage canPrint={can(role, "read")} />;
  else if (view === "invoice-register")
    content = <InvoiceRegisterPage canPrint={can(role, "read")} />;
  else if (view === "vehicle-invoices")
    content = <VehicleInvoicesPage canPrint={can(role, "read")} />;
  else if (view === "tax-report")
    content = <TaxReportPage canPrint={can(role, "read")} />;
  else if (view === "payments-received")
    content = <PaymentsReceivedPage role={role} canPrint={can(role, "read")} />;
  else if (view === "settlement-discounts")
    content = <SettlementDiscountsPage canPrint={can(role, "read")} />;
  else if (view === "customer-statement" && id)
    content = <CustomerStatementPage id={id} canPrint={can(role, "read")} />;
  else if (view === "audit")
    content =
      role === "CORE_ADMIN" ? <AuditPage canPrint={true} /> : <Forbidden />;
  else if (view === "vendors")
    content = <CatalogPage kind="vendors" role={role} />;
  else if (view === "vehicles") content = <VehiclesPage role={role} />;
  else if (view === "profile") content = <ProfilePage />;
  else if (view === "users")
    content = role === "CORE_ADMIN" ? <UsersPage /> : <Forbidden />;
  else if (configs[view])
    content = <MasterPage config={configs[view]} role={role} />;
  return (
    <AppShell user={session.user}>
      <Suspense fallback={<Loading label="Loading report controls" />}>
        {content}
      </Suspense>
    </AppShell>
  );
}
function Forbidden() {
  return (
    <div className="access-denied inline">
      <p className="eyebrow">Permission required</p>
      <h1>You can’t open this area.</h1>
      <p>This area is available only to Core administrators.</p>
      <Link className="button button-secondary" href="/">
        Return to overview
      </Link>
    </div>
  );
}
