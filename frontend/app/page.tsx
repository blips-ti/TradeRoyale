"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./_lib/auth";
import { Logo } from "./_components/Logo";

export default function Home() {
  const { ready, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(authenticated ? "/dashboard" : "/connect");
  }, [ready, authenticated, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <div className="animate-pulse">
        <Logo className="h-12" />
      </div>
      <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Loading…</span>
    </div>
  );
}
