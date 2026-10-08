"use client";
import Link from "next/link";

export function EntityTabs({ resource }: { resource: string }) {
  const groups = [
    [
      { resource: "hotels", label: "Hotels", href: "/hotels" },
      { resource: "hotel-rates", label: "Plan rates", href: "/hotel-rates" },
    ],
    [
      {
        resource: "companies",
        label: "Companies",
        href: "/configuration/companies",
      },
      {
        resource: "bank-accounts",
        label: "Bank accounts",
        href: "/bank-accounts",
      },
    ],
    [
      {
        resource: "tax-rules",
        label: "Tax rules",
        href: "/configuration/taxes",
      },
      {
        resource: "service-categories",
        label: "Service categories",
        href: "/service-categories",
      },
    ],
    [
      { resource: "vendors", label: "Vendors", href: "/vendors" },
      {
        resource: "vendor-profiles",
        label: "Additional details",
        href: "/vendor-profiles",
      },
    ],
  ];
  const group = groups.find((items) =>
    items.some((item) => item.resource === resource),
  );
  if (!group) return null;
  return (
    <nav className="entity-tabs" aria-label="Related screens">
      {group.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={resource === item.resource ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
