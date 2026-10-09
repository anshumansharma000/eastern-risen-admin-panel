"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { recordRoutes, type RecordView } from "@/lib/routes";
import { GuestActivity } from "@/features/masters/guest-activity";
import { CoreApp } from "./core-app";
import { CoreScreen } from "./core-screen";
import { Loading } from "./ui";

export function RecordPage({ view }: { view: RecordView }) {
  return (
    <Suspense fallback={<Loading label="Loading record" />}>
      <RecordScreen view={view} />
    </Suspense>
  );
}

function RecordScreen({ view }: { view: RecordView }) {
  const search = useSearchParams();
  const ids = search.getAll("id");
  const id = ids[0];
  if (
    ids.length !== 1 ||
    !id?.trim() ||
    id.length > 200 ||
    /[\s/\\?#\u0000-\u001f\u007f]/.test(id)
  ) {
    return (
      <CoreScreen>
        <div className="access-denied inline">
          <h1>Choose a record to open</h1>
          <p>This link has a missing or invalid record ID.</p>
          <Link
            className="button button-secondary"
            href={recordRoutes[view].register}
          >
            Return to the register
          </Link>
        </div>
      </CoreScreen>
    );
  }
  return view === "guest-activity" ? (
    <CoreScreen key={id}>
      <GuestActivity id={id} />
    </CoreScreen>
  ) : (
    <CoreApp key={`${view}:${id}`} view={view} id={id} />
  );
}
