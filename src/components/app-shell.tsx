"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CarFront,
  CircleDollarSign,
  CircleUserRound,
  FileText,
  Gauge,
  HandCoins,
  Hotel,
  LogOut,
  Menu,
  Megaphone,
  Inbox,
  Percent,
  ScrollText,
  ReceiptIndianRupee,
  Settings2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { CoreRole, Principal } from "@/lib/api/contracts";
import { can, roleLabel } from "@/lib/permissions";
import { BrandLogo } from "./brand-logo";
import { ErrorState } from "./ui";
import { confirmFormLeave } from "./form-guard";

const nav = [
  { label: "Overview", href: "/", icon: Gauge },
  { label: "Inquiries", href: "/inquiries", icon: Inbox },
  { label: "Invoices", href: "/invoices", icon: FileText },
  {
    label: "Bookings & quotes",
    href: "/commercial-bookings",
    icon: ReceiptIndianRupee,
  },
  { heading: "Reports" },
  { label: "Invoice Register", href: "/reports/invoices", icon: ScrollText },
  {
    label: "Vehicle-wise Invoices",
    href: "/reports/vehicle-invoices",
    icon: CarFront,
  },
  { label: "Tax", href: "/reports/taxes", icon: Percent },
  {
    label: "Payments",
    href: "/reports/payments-received",
    icon: WalletCards,
  },
  {
    label: "Receivables",
    href: "/reports/receivables",
    icon: CircleDollarSign,
  },
  {
    label: "Settlement Discounts",
    href: "/reports/settlement-discounts",
    icon: HandCoins,
  },
  {
    label: "Audit activity",
    href: "/reports/audit",
    icon: Activity,
    adminOnly: true,
  },
  { heading: "Master resources" },
  { label: "Customers", href: "/customers", icon: UsersRound },
  { label: "Travellers / Guests", href: "/guests", icon: UserRound },
  { label: "Hotels & rates", href: "/hotels", icon: Hotel },
  { label: "Vendors", href: "/vendors", icon: Building2 },
  { label: "Vehicles", href: "/vehicles", icon: CarFront },
  { heading: "Configuration" },
  {
    label: "Website announcements",
    href: "/configuration/announcements",
    icon: Megaphone,
    capability: "writeConfiguration",
  },
  {
    label: "Payment policy",
    href: "/configuration/payment-policy",
    icon: Percent,
  },
  {
    label: "Companies & banks",
    href: "/configuration/companies",
    icon: ReceiptIndianRupee,
    capability: "writeConfiguration",
  },
  {
    label: "Services & taxes",
    href: "/configuration/taxes",
    icon: Percent,
    capability: "writeConfiguration",
  },
  {
    label: "Staff access",
    href: "/users",
    icon: Settings2,
    capability: "users",
  },
] as const;

export function AppShell({
  user,
  children,
}: {
  user: Principal;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 780px)");
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (event.key !== "Tab") return;
      const items = [
        ...(sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled)",
        ) ?? []),
      ];
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keydown);
    };
  }, [open, mobile]);
  const active = (href: string) => {
    const aliases: Record<string, string[]> = {
      "/hotels": ["/hotel-rates"],
      "/vendors": ["/vendor-profiles"],
      "/configuration/companies": ["/bank-accounts"],
      "/configuration/taxes": ["/service-categories"],
    };
    return (
      pathname === href ||
      (href !== "/" && pathname.startsWith(`${href}/`)) ||
      (aliases[href] ?? []).includes(pathname)
    );
  };
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const role = user.role as CoreRole;
  async function logout() {
    if (!confirmFormLeave()) return;
    setLogoutError(null);
    setLogoutPending(true);
    try {
      await cache.cancelQueries();
      await api("/api/v1/auth/logout", { core: false, method: "POST" });
      cache.clear();
      router.replace("/login");
    } catch (error) {
      setLogoutError(error);
    } finally {
      setLogoutPending(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && open && (
        <button
          className="navigation-backdrop"
          tabIndex={-1}
          aria-label="Dismiss navigation"
          onClick={() => {
            setOpen(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <aside
        ref={sidebar}
        id="admin-navigation"
        className={open ? "sidebar open" : "sidebar"}
        inert={mobile && !open}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Admin navigation"
      >
        {mobile && open && (
          <button
            className="icon-button navigation-close"
            aria-label="Close navigation"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
          >
            <X />
          </button>
        )}
        <Link
          className="sidebar-brand"
          href="/"
          aria-label="Eastern Risen Admin home"
          onClick={() => setOpen(false)}
        >
          <BrandLogo className="sidebar-logo" priority />
        </Link>
        <div className="system-chip">Staff workspace</div>
        <nav>
          {nav.map((item, index) =>
            "heading" in item ? (
              <p key={index} className="nav-heading">
                {item.heading}
              </p>
            ) : (
              (!("capability" in item) || can(role, item.capability)) &&
              (!("adminOnly" in item) ||
                !item.adminOnly ||
                role === "CORE_ADMIN") && (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active(item.href) ? "page" : undefined}
                  className={active(item.href) ? "active" : ""}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              )
            ),
          )}
        </nav>
        <div className="account-card">
          <div className="account-identity">
            <span className="avatar">
              {user.displayName
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{roleLabel(role)}</small>
            </span>
          </div>
          <div className="account-actions">
            <Link href="/profile" onClick={() => setOpen(false)}>
              <CircleUserRound size={16} /> Profile
            </Link>
            <button type="button" onClick={logout} disabled={logoutPending}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
          {Boolean(logoutError) && <ErrorState error={logoutError} />}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            ref={menuButton}
            className="mobile-menu"
            aria-expanded={open}
            aria-controls="admin-navigation"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? <X /> : <Menu />}
          </button>
          <div className="top-context">Eastern Risen · Administration</div>
          <Link
            className="top-account"
            href="/profile"
            aria-label="Open profile"
          >
            <span className="avatar small">{user.displayName.charAt(0)}</span>
            <span>{user.displayName}</span>
          </Link>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
