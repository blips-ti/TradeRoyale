"use client";

import { useEffect } from "react";

// Auto-recovers from Next.js "Failed to load chunk" / ChunkLoadError. These happen on Vercel
// deployment skew: a client still running an old deployment tries to lazy-load a chunk whose
// files the new deployment already replaced (404). A full reload pulls the new deployment's HTML
// + chunks. A short timestamp guard prevents a reload loop if something is persistently broken.
const RELOAD_KEY = "tr_chunk_reload_at";
const RELOAD_GUARD_MS = 10_000;

function isChunkError(message: string): boolean {
  return /Loading chunk [\w-]+ failed|Failed to load chunk|ChunkLoadError|Loading CSS chunk/i.test(message);
}

export function ChunkReload() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - last < RELOAD_GUARD_MS) return; // already reloaded just now — don't loop
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // sessionStorage unavailable (private mode) — fall through and still reload once.
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      if (isChunkError(e.message || e.error?.message || "")) reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string } | undefined;
      if (isChunkError(reason?.message || String(e.reason ?? ""))) reloadOnce();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
