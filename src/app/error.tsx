"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="session-screen">
      <div className="error-panel" role="alert">
        <strong>Something went wrong while opening this page.</strong>
        {error.digest && <span>Reference: {error.digest}</span>}
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
