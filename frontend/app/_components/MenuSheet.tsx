"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Download, LogOut, Swords, Trophy, User, Wallet, X } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { usePwaInstall } from "@/app/_lib/usePwaInstall";
import { Avatar } from "./ui";

export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { authenticated, user, login, logout } = useAuth();
  const { canInstall, install } = usePwaInstall();
  const router = useRouter();

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="relative w-full max-w-md rounded-t-[1.75rem] border-t border-[color:var(--color-line-strong)] bg-[color:var(--color-bg)] p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[18px] font-bold uppercase tracking-tight">Menu</h2>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--color-surface)] text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {authenticated && user && (
              <div className="mt-4 flex items-center gap-3 rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3">
                <Avatar name={user.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-fg">{user.name}</p>
                  <p className="truncate font-mono text-[12px] text-muted">
                    {user.address ? `${user.address.slice(0, 6)}…${user.address.slice(-4)}` : "no wallet"}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-1.5">
              <Row icon={Swords} label="Matches" onClick={() => go("/dashboard")} />
              <Row icon={Trophy} label="My Match" onClick={() => go("/dashboard")} />
              <Row icon={User} label="Profile & Achievements" onClick={() => go("/profile")} />
              {canInstall && (
                <Row
                  icon={Download}
                  label="Install app"
                  highlight
                  onClick={() => {
                    onClose();
                    install();
                  }}
                />
              )}
            </div>

            <div className="mt-4 border-t border-[color:var(--color-line)] pt-4">
              {authenticated ? (
                <button
                  onClick={() => {
                    onClose();
                    logout();
                    router.replace("/connect");
                  }}
                  className="flex w-full items-center gap-3 rounded-card bg-[color:var(--color-loss)]/12 px-4 py-3.5 text-[15px] font-semibold text-[color:var(--color-loss)] transition active:scale-[0.99]"
                >
                  <LogOut className="h-4 w-4" /> Disconnect
                </button>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    login();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-pill bg-[color:var(--color-lime)] px-4 py-3.5 text-[15px] font-semibold text-black transition active:scale-[0.99]"
                >
                  <Wallet className="h-4 w-4" /> Connect wallet
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  icon: Icon,
  label,
  onClick,
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-card border px-4 py-3.5 text-left transition active:scale-[0.99] ${
        highlight
          ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10"
          : "border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
      }`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-full ${
          highlight ? "bg-[color:var(--color-lime)] text-black" : "bg-[color:var(--color-surface-2)] text-[color:var(--color-lime)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[15px] font-semibold text-fg">{label}</span>
    </button>
  );
}
