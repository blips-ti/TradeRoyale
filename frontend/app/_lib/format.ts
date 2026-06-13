export function shortAddress(addr?: string | null, lead = 6, tail = 4) {
  if (!addr) return "—";
  if (addr.length <= lead + tail) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function usd(n: number) {
  // Whole dollars stay clean ($20); fractional amounts keep cents so $0.10 never shows as $0.
  const digits = Number.isInteger(n) ? 0 : 2;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Deterministic, friendly trader handle derived from a wallet address / id. */
const ADJ = ["Degen", "Based", "Giga", "Turbo", "Alpha", "Rekt", "Diamond", "Feral", "Hyper", "Lucky"];
const NOUN = ["Ape", "Whale", "Chad", "Wolf", "Shark", "Bull", "Sniper", "Maxi", "Pepe", "Bot"];

export function handleFor(seed?: string | null) {
  if (!seed) return "Anon";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = ADJ[h % ADJ.length];
  const n = NOUN[(h >>> 8) % NOUN.length];
  const num = (h >>> 16) % 1000;
  return `${a}${n}${num}`;
}
