"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, safeId } from "@/lib/api/client";
import type { Collection, Resource } from "@/lib/api/contracts";
import { recordHref } from "@/lib/routes";
import {
  Button,
  Empty,
  ErrorState,
  Loading,
  Pagination,
} from "@/components/ui";

export interface Inquiry {
  id: string;
  type: "CONTACT" | "TOUR" | "TOUR_DETAIL";
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
  details: Record<string, string>;
}
const typeLabels: Record<Inquiry["type"], string> = {
  CONTACT: "Contact",
  TOUR: "General tour",
  TOUR_DETAIL: "Tour detail",
};
export function inquiryType(type: Inquiry["type"]) {
  return typeLabels[type] ?? "Other inquiry";
}
function receivedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(date) + " IST"
    : "Date unavailable";
}
function TypeLabel({ type }: { type: Inquiry["type"] }) {
  return <span className="inquiry-type">{inquiryType(type)}</span>;
}
export function InquiriesPage() {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["inquiries", page],
    queryFn: ({ signal }) =>
      api<Collection<Inquiry>>(`/inquiries?page=${page}&pageSize=25`, {
        signal,
      }),
  });
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Website enquiries</p>
          <h1>Inquiries</h1>
          <p>Contact messages and travel requirements, newest first.</p>
        </div>
        <Button
          variant="secondary"
          disabled={list.isFetching}
          onClick={() => void list.refetch()}
        >
          Refresh inquiries
        </Button>
      </header>
      {list.isLoading ? (
        <Loading label="Loading inquiries" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        list.data && (
          <>
            {!list.data.data.length ? (
              <Empty
                title="No inquiries yet"
                detail="Messages submitted through the website will appear here."
              />
            ) : (
              <section
                className="table-card"
                aria-label="Website inquiries"
                aria-busy={list.isFetching}
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Received</th>
                        <th>Inquiry</th>
                        <th>Contact</th>
                        <th>Journey / service</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.data.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <time dateTime={item.createdAt}>
                              {receivedAt(item.createdAt)}
                            </time>
                          </td>
                          <td>
                            <Link
                              className="text-link"
                              href={recordHref("inquiry-detail", item.id)}
                            >
                              {item.fullName}
                            </Link>
                            <div>
                              <TypeLabel type={item.type} />
                            </div>
                          </td>
                          <td>
                            <div>{item.email}</div>
                            <div>{item.phone}</div>
                          </td>
                          <td>
                            {item.details.tourTitle ||
                              item.details.service ||
                              (item.type === "TOUR"
                                ? "Tailor-made journey"
                                : "General enquiry")}
                          </td>
                          <td>
                            <Link
                              className="text-link"
                              href={recordHref("inquiry-detail", item.id)}
                              aria-label={`View inquiry from ${item.fullName}`}
                            >
                              View inquiry
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <Pagination
              page={list.data.pagination.page}
              pageSize={list.data.pagination.pageSize}
              total={list.data.pagination.total}
              onPage={setPage}
            />
          </>
        )
      )}
    </>
  );
}
const labels: Record<string, string> = {
  country: "Country of residence",
  contactMethod: "Preferred contact method",
  message: "Message",
  service: "Service",
  tourTitle: "Selected journey",
  region: "Region",
  duration: "Duration",
  travelDates: "Preferred travel dates",
  adults: "Adults",
  children: "Children",
  interests: "Interests or requested changes",
  requirements: "Dietary, accessibility or other requirements",
  additionalNotes: "Additional notes",
};
function sourcePage(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? url.origin + url.pathname
      : null;
  } catch {
    return null;
  }
}
export function InquiryDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["inquiry", id],
    queryFn: ({ signal }) =>
      api<Resource<Inquiry>>(`/inquiries/${safeId(id)}`, { signal }),
  });
  const item = query.data?.data;
  const source = sourcePage(item?.details.pageUrl);
  return (
    <>
      <header className="page-header">
        <div>
          <Link className="text-link" href="/inquiries">
            ← All inquiries
          </Link>
          <p className="eyebrow">Website enquiry</p>
          <h1>Inquiry details</h1>
        </div>
        <Button
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh inquiry
        </Button>
      </header>
      {query.isLoading ? (
        <Loading label="Loading inquiry" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        item && (
          <article className="inquiry-detail" aria-busy={query.isFetching}>
            <section
              className="inquiry-panel"
              aria-labelledby="inquiry-contact-title"
            >
              <TypeLabel type={item.type} />
              <h2 id="inquiry-contact-title">{item.fullName}</h2>
              <dl className="inquiry-fields">
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a
                      className="text-link"
                      href={`mailto:${encodeURIComponent(item.email)}`}
                    >
                      {item.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Phone / WhatsApp</dt>
                  <dd>
                    <a
                      className="text-link"
                      href={`tel:${encodeURIComponent(item.phone)}`}
                    >
                      {item.phone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>
                    <time dateTime={item.createdAt}>
                      {receivedAt(item.createdAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{item.id}</dd>
                </div>
              </dl>
            </section>
            <section
              className="inquiry-panel"
              aria-labelledby="inquiry-requirements-title"
            >
              <h2 id="inquiry-requirements-title">
                {item.type === "CONTACT"
                  ? "Message and context"
                  : "Travel requirements"}
              </h2>
              <dl className="inquiry-fields">
                {Object.entries(labels)
                  .filter(([key]) => item.details[key]?.trim())
                  .map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd className="inquiry-text">{item.details[key]}</dd>
                    </div>
                  ))}
                {Object.entries(item.details)
                  .filter(
                    ([key, value]) =>
                      !labels[key] && key !== "pageUrl" && value?.trim(),
                  )
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
                      <dd className="inquiry-text">{value}</dd>
                    </div>
                  ))}
                {source && (
                  <div>
                    <dt>Submitted from</dt>
                    <dd>
                      <a
                        className="text-link"
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        {source}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              <p className="inquiry-note">
                This enquiry is a planning request and does not confirm a
                booking.
              </p>
            </section>
          </article>
        )
      )}
    </>
  );
}
