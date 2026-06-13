"use client";

import { cn } from "@/app/_lib/cn";
import { initialsOf } from "@/app/_lib/format";
import { botAvatar, matchLogo, playerAvatar } from "@/app/_lib/img";
import { motion } from "framer-motion";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import * as React from "react";

/* ---------- Button ---------- */

type ButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  variant?: "lime" | "black" | "dark" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
};

export function Button({
  className,
  variant = "lime",
  size = "lg",
  fullWidth = false,
  children,
  ...rest
}: ButtonProps) {
  const base =
    "relative inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none rounded-pill select-none";
  const sizes = {
    sm: "h-9 px-4 text-[13px]",
    md: "h-11 px-5 text-sm",
    lg: "h-13 px-6 py-3.5 text-[15px]",
  } as const;
  const variants = {
    lime: "bg-[color:var(--color-lime)] text-black hover:brightness-105 shadow-[var(--shadow-lime)]",
    black: "bg-black text-white hover:bg-black/85",
    dark: "bg-[color:var(--color-surface-2)] text-fg border border-[color:var(--color-line-strong)] hover:bg-[color:var(--color-surface-3)]",
    ghost: "text-muted hover:text-fg hover:bg-white/5",
    danger: "bg-[color:var(--color-loss)]/12 text-[color:var(--color-loss)] border border-[color:var(--color-loss)]/40 hover:bg-[color:var(--color-loss)]/20",
  } as const;
  return (
    <button
      className={cn(base, sizes[size], variants[variant], fullWidth && "w-full", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Tournament tag (bonds / crypto) ---------- */

export function Tag({ children, onLime = false }: { children: React.ReactNode; onLime?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-[12px] font-medium",
        onLime ? "bg-black/10 text-black" : "bg-[color:var(--color-surface-2)] text-muted",
      )}
    >
      <BarsIcon className="h-3 w-3 opacity-80" />
      {children}
    </span>
  );
}

function BarsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden>
      <path d="M1 9l3-3 2 2 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Status chip ---------- */

export function Status({ kind }: { kind: "registered" | "in-progress" | "open" }) {
  if (kind === "registered")
    return (
      <span className="inline-flex items-center gap-2 rounded-pill bg-[#3a4a24] py-1 pl-1 pr-3 text-[12.5px] font-semibold text-white">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--color-profit)] text-black">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        Registered
      </span>
    );
  if (kind === "in-progress")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill border border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[color:var(--color-lime)]">
        <Minus className="h-3.5 w-3.5" /> In progress
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-[color:var(--color-lime)] px-3 py-1.5 text-[12.5px] font-semibold text-black">
      <Plus className="h-3.5 w-3.5" strokeWidth={3} /> Open
    </span>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-[color:var(--color-loss)]/50 bg-[color:var(--color-loss)]/12 px-3 py-1.5 text-[12.5px] font-bold uppercase tracking-wide text-[color:var(--color-loss)]">
      <span className="pulse-live inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-loss)]" />
      Live
    </span>
  );
}

/* ---------- Pill ---------- */

export function Pill({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "lime" | "cyan" | "profit" | "loss" | "neutral";
}) {
  const tones = {
    lime: "bg-[color:var(--color-lime)] text-black",
    cyan: "bg-[color:var(--color-cyan)]/15 text-[color:var(--color-cyan)]",
    profit: "bg-[color:var(--color-profit)]/15 text-[color:var(--color-profit)]",
    loss: "bg-[color:var(--color-loss)]/15 text-[color:var(--color-loss)]",
    neutral: "bg-[color:var(--color-surface-2)] text-muted",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <As
      className={cn(
        "relative rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </As>
  );
}

/* ---------- Image circle (shared) ---------- */

function ImgCircle({
  src,
  fallback,
  size,
  className,
}: {
  src: string;
  fallback: React.ReactNode;
  size: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[color:var(--color-surface-2)] font-bold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      <span className="absolute">{fallback}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
    </span>
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return <ImgCircle src={playerAvatar(name)} fallback={initialsOf(name) || "?"} size={size} className={className} />;
}

export function MatchLogo({ seed, size = 48, className }: { seed: string; size?: number; className?: string }) {
  return <ImgCircle src={matchLogo(seed)} fallback="◆" size={size} className={className} />;
}

export function BotAvatar({ seed, size = 36, className }: { seed: string; size?: number; className?: string }) {
  return <ImgCircle src={botAvatar(seed)} fallback="🤖" size={size} className={className} />;
}

/* ---------- Count-up stat ---------- */

export function Stat({ value, prefix = "", className }: { value: number; prefix?: string; className?: string }) {
  const [display, setDisplay] = React.useState(value);
  const ref = React.useRef(value);
  React.useEffect(() => {
    const from = ref.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 500;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else ref.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={cn("tnum", className)}>
      {prefix}
      {display.toLocaleString("en-US")}
    </span>
  );
}

/* ---------- Reveal ---------- */

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}
