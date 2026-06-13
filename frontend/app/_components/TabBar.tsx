"use client";

import { cn } from "@/app/_lib/cn";
import { Swords, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Matches", icon: Swords },
  { href: "/profile", label: "Profile", icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-2">
      <div className="glass flex items-center justify-around rounded-pill border border-[color:var(--color-line-strong)] p-1.5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-[12px] font-semibold tracking-tight transition",
                active ? "bg-[color:var(--color-lime)] text-black" : "text-muted hover:text-fg",
              )}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={2.4} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
