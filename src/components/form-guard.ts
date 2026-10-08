"use client";

import { useEffect, useRef } from "react";

type Guard = { dirty: boolean; saving: boolean };
const guards = new Set<Guard>();

export function confirmFormLeave() {
  if ([...guards].some((item) => item.saving)) return false;
  return (
    ![...guards].some((item) => item.dirty) ||
    window.confirm("Discard your unsaved changes and leave this page?")
  );
}

export function useFormGuard(dirty: boolean, saving = false) {
  const guard = useRef<Guard>({ dirty, saving });
  useEffect(() => {
    guard.current.dirty = dirty;
    guard.current.saving = saving;
  }, [dirty, saving]);
  useEffect(() => {
    const entry = guard.current;
    guards.add(entry);
    function unload(event: BeforeUnloadEvent) {
      if ([...guards].some((item) => item.dirty || item.saving)) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    function navigate(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const url = new URL(link.href);
      if (url.pathname === location.pathname && url.search === location.search)
        return;
      if (!confirmFormLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    // Only one listener pair is needed even when a page contains several forms.
    if (guards.size === 1) {
      window.addEventListener("beforeunload", unload);
      document.addEventListener("click", navigate, true);
    }
    // Keep the first listeners until the last form unmounts.
    const cleanup = () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
    if (guards.size === 1) listenerCleanup = cleanup;
    return () => {
      guards.delete(entry);
      if (!guards.size) {
        listenerCleanup?.();
        listenerCleanup = undefined;
      }
    };
  }, []);
  return () => {
    guard.current.dirty = false;
    guard.current.saving = false;
  };
}
let listenerCleanup: (() => void) | undefined;
