import { cn } from "@/app/_lib/cn";

export function Logo({ className, withWord = true }: { className?: string; withWord?: boolean }) {
  if (withWord) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/lockup-crown-transparent.png" alt="TradeRoyale" className={cn("h-7 w-auto", className)} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icon-crown.svg" alt="TradeRoyale" className={cn("h-8 w-8 rounded-lg", className)} />;
}
