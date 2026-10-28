"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Collection, Resource } from "@/lib/api/contracts";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  categories,
  indiaInput,
  indiaISO,
  scheduleLabel,
  type Announcement,
  type AnnouncementInput,
  type PublicAnnouncement,
} from "./contracts";

export function AnnouncementsPage() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [previewPath, setPreviewPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const cache = useQueryClient();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const records = useQuery({
    queryKey: ["announcements", page],
    queryFn: ({ signal }) =>
      api<Collection<Announcement>>(`/announcements?page=${page}&pageSize=25`, {
        signal,
      }),
    refetchInterval: 60000,
  });
  const active = useQuery({
    queryKey: ["announcement-active", previewPath],
    queryFn: ({ signal }) =>
      api<{ data: PublicAnnouncement[]; serverTime: string }>(
        `/announcements/active?page=${encodeURIComponent(previewPath)}`,
        { signal },
      ),
    refetchInterval: 30000,
  });
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Website</p>
          <h1>Announcements</h1>
          <p>
            One considered message above the navigation. Schedule updates
            without rebuilding the website.
          </p>
        </div>
        <Button
          onClick={() => {
            setNotice("");
            setEditing("new");
          }}
        >
          New announcement
        </Button>
      </header>
      {notice && (
        <p className="success-panel" role="status">
          {notice}
        </p>
      )}
      <section className="commercial-card announcement-current">
        <div>
          <p className="eyebrow">Currently featured</p>
          <h2>Check a website page</h2>
        </div>
        <form
          className="announcement-path"
          onSubmit={(e) => {
            e.preventDefault();
            setPreviewPath(pathInput);
          }}
        >
          <Field label="Website path">
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/tours"
              required
              maxLength={300}
            />
          </Field>
          <Button variant="secondary">Check page</Button>
        </form>
        {active.isLoading ? (
          <Loading label="Checking current announcements" />
        ) : active.isError ? (
          <ErrorState
            error={active.error}
            onRetry={() => void active.refetch()}
          />
        ) : active.data?.data[0] ? (
          <>
            <BannerPreview item={active.data.data[0]} />
            <p className="announcement-help">
              {active.data.data.length} current update
              {active.data.data.length === 1 ? "" : "s"} for {previewPath}.
              Important announcements come first, followed by the most recently
              started. Visitor dismissals may change what they see.
            </p>
          </>
        ) : (
          <p>No announcement is currently eligible for this page.</p>
        )}
      </section>
      {records.isLoading ? (
        <Loading label="Loading announcements" />
      ) : records.isError ? (
        <ErrorState
          error={records.error}
          onRetry={() => void records.refetch()}
        />
      ) : !records.data?.data.length ? (
        <Empty
          title="Room for your next update"
          detail="Create a draft, preview the ribbon, then publish now or schedule it for later."
        />
      ) : (
        <section className="commercial-card announcement-register">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Status</th>
                  <th>Schedule · India time</th>
                  <th>Placement</th>
                  <th>Priority</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.data.data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <p>{item.message}</p>
                      <small>{categories[item.category]}</small>
                    </td>
                    <td>
                      <span
                        className={`announcement-status announcement-status--${scheduleLabel(item, now).toLowerCase()}`}
                      >
                        {scheduleLabel(item, now)}
                      </span>
                    </td>
                    <td>
                      {formatDate(item.startsAt)}
                      <small>
                        {item.endsAt
                          ? `Until ${formatDate(item.endsAt)}`
                          : "No expiry"}
                      </small>
                    </td>
                    <td>
                      {item.placement === "HOME"
                        ? "Homepage"
                        : item.placement === "PUBLIC"
                          ? "All public pages"
                          : item.paths.join(", ")}
                    </td>
                    <td>
                      {item.priority === "IMPORTANT" ? "Important" : "Normal"}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setNotice("");
                          setEditing(item);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="announcement-pagination">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} · {records.data.pagination.total} announcements
            </span>
            <Button
              variant="secondary"
              disabled={page * 25 >= records.data.pagination.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </footer>
        </section>
      )}
      {editing && (
        <AnnouncementEditor
          key={editing === "new" ? "new" : `${editing.id}:${editing.version}`}
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice(
              "Announcement saved. Website changes can take up to one minute to appear.",
            );
            await Promise.all([
              cache.invalidateQueries({ queryKey: ["announcements"] }),
              cache.invalidateQueries({ queryKey: ["announcement-active"] }),
            ]);
          }}
        />
      )}
    </>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
function BannerPreview({
  item,
  mobile = false,
}: {
  item: Pick<
    AnnouncementInput,
    "category" | "message" | "linkText" | "priority" | "dismissible"
  >;
  mobile?: boolean;
}) {
  return (
    <div
      className={`announcement-preview${mobile ? " announcement-preview--mobile" : ""}${item.priority === "IMPORTANT" ? " announcement-preview--important" : ""}`}
    >
      <span className="announcement-preview__label">
        {categories[item.category]}
      </span>
      <span className="announcement-preview__message">
        {item.message || "Your announcement will appear here."}
      </span>
      {item.linkText && (
        <span className="announcement-preview__link">{item.linkText} ↗</span>
      )}
      {item.dismissible && (
        <span className="announcement-preview__close" aria-hidden="true">
          ×
        </span>
      )}
    </div>
  );
}

function AnnouncementEditor({
  item,
  onClose,
  onSaved,
}: {
  item?: Announcement;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<AnnouncementInput>(() =>
    item
      ? {
          name: item.name,
          category: item.category,
          message: item.message,
          linkText: item.linkText,
          linkUrl: item.linkUrl,
          status: item.status,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          placement: item.placement,
          paths: item.paths,
          priority: item.priority,
          dismissible: item.dismissible,
        }
      : {
          name: "",
          category: "GENERAL",
          message: "",
          linkText: null,
          linkUrl: null,
          status: "DRAFT",
          startsAt: new Date().toISOString(),
          endsAt: null,
          placement: "HOME",
          paths: [],
          priority: "NORMAL",
          dismissible: true,
        },
  );
  const [start, setStart] = useState(indiaInput(draft.startsAt));
  const [end, setEnd] = useState(draft.endsAt ? indiaInput(draft.endsAt) : "");
  const [paths, setPaths] = useState(draft.paths.join("\n"));
  const [error, setError] = useState<unknown>(null);
  const [mobile, setMobile] = useState(false);
  const save = useMutation({
    mutationFn: (body: AnnouncementInput) =>
      api<Resource<Announcement>>(
        item ? `/announcements/${item.id}` : "/announcements",
        {
          method: item ? "PUT" : "POST",
          body: item ? { ...body, version: item.version } : body,
        },
      ),
    onSuccess: onSaved,
    onError: setError,
  });
  const change = <K extends keyof AnnouncementInput>(
    key: K,
    value: AnnouncementInput[K],
  ) => setDraft((old) => ({ ...old, [key]: value }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const startsAt = start === indiaInput(draft.startsAt) ? draft.startsAt : indiaISO(start),
        endsAt = end ? (draft.endsAt && end === indiaInput(draft.endsAt) ? draft.endsAt : indiaISO(end)) : null;
      if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt))
        throw new Error("The end must be later than the start.");
      if (Boolean(draft.linkText?.trim()) !== Boolean(draft.linkUrl?.trim()))
        throw new Error(
          "Provide both link text and destination, or leave both empty.",
        );
      save.mutate({
        ...draft,
        startsAt,
        endsAt,
        linkText: draft.linkText?.trim() || null,
        linkUrl: draft.linkUrl?.trim() || null,
        paths:
          draft.placement === "SELECTED"
            ? paths
                .split(/[\n,]/)
                .map((p) => p.trim())
                .filter(Boolean)
            : [],
      });
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Modal
      title={item ? "Edit announcement" : "New announcement"}
      eyebrow="Website announcement"
      subtitle="Dates and times use India Standard Time (UTC+05:30)."
      className="announcement-editor"
      closeDisabled={save.isPending}
      onClose={onClose}
    >
      <form className="record-form" onSubmit={submit}>
        <fieldset disabled={save.isPending} className="announcement-fields">
          <div className="record-form-grid">
            <Field label="Internal name" hint="Only your team sees this.">
              <Input
                value={draft.name}
                onChange={(e) => change("name", e.target.value)}
                required
                maxLength={120}
              />
            </Field>
            <Field label="Category">
              <Select
                value={draft.category}
                onChange={(e) =>
                  change(
                    "category",
                    e.target.value as AnnouncementInput["category"],
                  )
                }
              >
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Message"
              hint={`${draft.message.length}/140 characters. Aim for 90 or fewer.`}
            >
              <Textarea
                value={draft.message}
                onChange={(e) =>
                  change("message", e.target.value.replace(/[\r\n]/g, " "))
                }
                required
                maxLength={140}
                rows={2}
              />
            </Field>
            <Field label="Link text (optional)">
              <Input
                value={draft.linkText ?? ""}
                onChange={(e) => change("linkText", e.target.value)}
                maxLength={40}
                placeholder="Explore journey"
              />
            </Field>
            <Field
              label="Link destination (optional)"
              hint="A website path such as /tours, or a full HTTPS link."
            >
              <Input
                value={draft.linkUrl ?? ""}
                onChange={(e) => change("linkUrl", e.target.value)}
                maxLength={2048}
                placeholder="/tours"
              />
            </Field>
            <Field label="Status">
              <Select
                value={draft.status}
                onChange={(e) =>
                  change(
                    "status",
                    e.target.value as AnnouncementInput["status"],
                  )
                }
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={draft.priority}
                onChange={(e) =>
                  change(
                    "priority",
                    e.target.value as AnnouncementInput["priority"],
                  )
                }
              >
                <option value="NORMAL">Normal</option>
                <option value="IMPORTANT">Important</option>
              </Select>
            </Field>
            <Field label="Starts · India time">
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStart(indiaInput(new Date().toISOString()))}
              >
                Use current time
              </Button>
            </Field>
            <Field label="Ends · India time (optional)">
              <Input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            <Field label="Show on">
              <Select
                value={draft.placement}
                onChange={(e) =>
                  change(
                    "placement",
                    e.target.value as AnnouncementInput["placement"],
                  )
                }
              >
                <option value="HOME">Homepage only</option>
                <option value="PUBLIC">All public pages</option>
                <option value="SELECTED">Selected pages</option>
              </Select>
            </Field>
            {draft.placement === "SELECTED" && (
              <Field
                label="Selected website paths"
                hint="One path per line. Matches the exact page, for example /tours or /destinations. Up to 30 pages; private pages are excluded."
              >
                <Textarea
                  value={paths}
                  onChange={(e) => setPaths(e.target.value)}
                  required
                />
              </Field>
            )}
            <label className="announcement-check">
              <input
                type="checkbox"
                checked={draft.dismissible}
                onChange={(e) => change("dismissible", e.target.checked)}
              />
              Allow visitors to dismiss this announcement
            </label>
          </div>
          <section className="announcement-preview-area">
            <div>
              <h3>Ribbon preview</h3>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMobile(!mobile)}
              >
                {mobile ? "Show desktop" : "Show mobile"}
              </Button>
            </div>
            <BannerPreview item={draft} mobile={mobile} />
            <p className="announcement-help">
              Publishing makes this eligible within its schedule. Important
              updates take precedence. Saving a published revision makes it
              visible again to visitors who dismissed an earlier version.
            </p>
          </section>
        </fieldset>
        {Boolean(error) && <ErrorState error={error} />}
        <footer>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending
              ? "Saving…"
              : draft.status === "PUBLISHED"
                ? "Save & publish"
                : draft.status === "ARCHIVED"
                  ? "Save as archived"
                  : "Save draft"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
