"use client";

import { recordHref } from "@/lib/routes";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  History,
  ReceiptIndianRupee,
} from "lucide-react";
import { getResource, safeId } from "@/lib/api/client";
import { formatINR } from "@/lib/money";
import { Empty, ErrorState, Loading } from "@/components/ui";

type Activity = {
  guestId: string;
  lastService: null | {
    invoiceId: string;
    invoiceNumber: string;
    date: string;
    descriptions: string[];
  };
  lastPayment: null | {
    receiptId: string;
    invoiceId: string;
    date: string;
    amount: string;
  };
  legacyLastServiceAvailed: string | null;
  legacyLastAmountPaid: string | null;
};
export function GuestActivity({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["guest-activity", id],
    queryFn: ({ signal }) =>
      getResource<Activity>(`/guests/${safeId(id)}/activity`, signal),
  });
  if (query.isLoading) return <Loading label="Loading traveller activity" />;
  if (query.isError) return <ErrorState error={query.error} />;
  const activity = query.data!.data;
  return (
    <>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/guests">
            <ArrowLeft size={16} /> Travellers & guests
          </Link>
          <p className="eyebrow">Linked operational history</p>
          <h1>Guest activity</h1>
          <p>
            Live transactional activity is shown separately from imported
            historical summaries.
          </p>
        </div>
      </header>
      <section className="overview-columns">
        <article className="table-card activity-card">
          <History />
          <p className="eyebrow">Latest issued service</p>
          {activity.lastService ? (
            <>
              <h2>{activity.lastService.invoiceNumber}</h2>
              <p>{activity.lastService.date}</p>
              <ul>
                {activity.lastService.descriptions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              <Link
                className="button button-secondary"
                href={recordHref(
                  "invoice-detail",
                  activity.lastService.invoiceId,
                )}
              >
                Open invoice <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <Empty
              title="No linked service"
              detail="Free-text invoice traveller names do not create a guest relationship."
            />
          )}
        </article>
        <article className="table-card activity-card">
          <ReceiptIndianRupee />
          <p className="eyebrow">Latest confirmed payment</p>
          {activity.lastPayment ? (
            <>
              <h2>{formatINR(activity.lastPayment.amount)}</h2>
              <p>{activity.lastPayment.date}</p>
              <Link
                className="button button-secondary"
                href={recordHref(
                  "invoice-detail",
                  activity.lastPayment.invoiceId,
                )}
              >
                Open invoice <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <Empty
              title="No linked payment"
              detail="No confirmed receipt is linked through this guest’s invoices."
            />
          )}
        </article>
      </section>
      <section className="legacy-panel">
        <div>
          <p className="eyebrow">Imported historical information</p>
          <h2>Legacy summary</h2>
          <p>
            These values are informational and are not fabricated as invoices or
            receipts.
          </p>
        </div>
        <dl>
          <div>
            <dt>Last service recorded</dt>
            <dd>{activity.legacyLastServiceAvailed ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>Last amount recorded</dt>
            <dd>{formatINR(activity.legacyLastAmountPaid)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
