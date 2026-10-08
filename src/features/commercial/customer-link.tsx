"use client";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
export function CustomerLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const origin = (process.env.NEXT_PUBLIC_LANDING_PAGE_ORIGIN || "").replace(
    /\/$/,
    "",
  );
  const url = origin ? `${origin}/quote/${encodeURIComponent(token)}` : "";
  return (
    <div className="commercial-link">
      <label className="field">
        <span>Private customer URL</span>
        <Input
          readOnly
          value={
            url ||
            "Configure NEXT_PUBLIC_LANDING_PAGE_ORIGIN to generate the URL"
          }
          aria-label="Private customer URL"
        />
      </label>
      <Button
        type="button"
        disabled={!url}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
