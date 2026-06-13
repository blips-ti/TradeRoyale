"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Check, Cpu, Sparkles, Wallet } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame, type AgentConfig } from "@/app/_lib/store";
import { useAchievements } from "@/app/_lib/achievementsStore";
import { useMatchView } from "@/app/_lib/useMatchView";
import { api } from "@/app/_lib/api";
import { AppShell } from "@/app/_components/AppShell";
import { BotAvatar, Button, Card, Reveal, Spinner } from "@/app/_components/ui";

const RISKS: { key: AgentConfig["risk"]; label: string; desc: string; starter: string }[] = [
  {
    key: "sniper",
    label: "Sniper",
    desc: "Patient. Few, high-conviction entries.",
    starter:
      "Trade patiently. Only take high-conviction setups on majors like ETH and WETH. Few positions, tight risk, cut losers fast, never chase a pump.",
  },
  {
    key: "balanced",
    label: "Balanced",
    desc: "Measured risk, steady compounding.",
    starter:
      "Trade with measured risk on Base majors. Scale into confirmed trends, take profit into strength, keep position sizes moderate and protect the downside.",
  },
  {
    key: "degen",
    label: "Degen",
    desc: "Max aggression. Send it.",
    starter:
      "Maximum aggression. Chase momentum, size up on breakouts, rotate fast into whatever is pumping on Base. Cut dead trades instantly and keep swinging.",
  },
];

const TEMPLATES = [
  "Momentum scalper: ride strong trends on majors, cut losers fast, never hold through reversals.",
  "Mean-reversion: fade extremes, buy fear, sell euphoria, tight risk per trade.",
  "News/narrative hunter: rotate into whatever is pumping, take profit into strength.",
];

export default function SetupPage() {
  return (
    <AppShell>
      <Setup />
    </AppShell>
  );
}

function Setup() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { authenticated } = useAuth();
  const { setAgent } = useGame();
  const tryUnlock = useAchievements((s) => s.tryUnlock);
  const { view } = useMatchView(params.id);

  // The caller's own player in this game (source of truth for name + saved strategy + funding).
  const [me, setMe] = useState<{ playerId: string; displayName: string; confirmed: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const [risk, setRisk] = useState<AgentConfig["risk"]>("balanced");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasStrategy, setHasStrategy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    let alive = true;
    api
      .getActive()
      .then((res) => {
        if (!alive) return;
        if (res.game?.id === params.id && res.player) {
          setMe({
            playerId: res.player.id,
            displayName: res.player.displayName,
            confirmed: res.player.depositStatus === "confirmed",
          });
          if (res.player.strategyPrompt) {
            setPrompt(res.player.strategyPrompt);
            setHasStrategy(true);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authenticated, params.id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted">
        <Spinner /> <span className="text-sm">Loading Agent Studio…</span>
      </div>
    );
  }

  if (!me) {
    return (
      <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-[14px] text-fg">Register for this Match first.</p>
        <Button size="sm" onClick={() => router.push(`/match/${params.id}`)}>
          Go to Match
        </Button>
      </Card>
    );
  }

  if (!me.confirmed) {
    return (
      <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--color-lime)]/12 text-[color:var(--color-lime)]">
          <Wallet className="h-5 w-5" />
        </span>
        <p className="text-[14px] text-fg">Fund your vault to set up your agent.</p>
        <Button size="sm" onClick={() => router.push(`/match/${params.id}`)}>
          Complete deposit
        </Button>
      </Card>
    );
  }

  const pickPersona = (key: AgentConfig["risk"]) => {
    setRisk(key);
    setPrompt(RISKS.find((r) => r.key === key)!.starter);
  };

  const save = async () => {
    const text = prompt.trim();
    if (!text) {
      setError("Give your agent a strategy first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setStrategy(params.id, me.playerId, text);
      setAgent({ name: me.displayName, risk, prompt: text });
      tryUnlock("agent");
      setHasStrategy(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      setError((e as Error).message || "Couldn't save your strategy");
    } finally {
      setSaving(false);
    }
  };

  const live = view?.bucket === "live";

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      <Reveal>
        <div className="flex items-center gap-2 px-1">
          <BotAvatar seed={me.displayName} size={38} />
          <div>
            <h1 className="font-display text-[22px] font-bold uppercase leading-none tracking-tight">
              Agent Studio
            </h1>
            <p className="text-[12.5px] text-muted">
              {me.displayName} · {view?.name ?? "your match"}
            </p>
          </div>
        </div>
      </Reveal>

      {/* status */}
      <Reveal delay={0.04}>
        <Card className="flex items-center justify-between p-4">
          <span className="text-[13px] text-muted">
            {live ? "Match is live" : "Open lobby"}
          </span>
          <span className="font-mono text-[13px] text-[color:var(--color-lime)]">
            {live ? "trading now" : "goes live at the bell"}
          </span>
        </Card>
      </Reveal>

      {/* agent name (locked at join) */}
      <Reveal delay={0.06}>
        <div className="flex flex-col gap-2">
          <Label>Agent name</Label>
          <Card className="flex items-center justify-between px-4 py-3.5">
            <span className="font-display text-[16px] font-semibold text-fg">{me.displayName}</span>
            <span className="text-[11px] text-dim">locked in</span>
          </Card>
        </div>
      </Reveal>

      {/* risk persona */}
      <Reveal delay={0.08}>
        <div className="flex flex-col gap-2">
          <Label>Persona</Label>
          <div className="grid grid-cols-3 gap-2">
            {RISKS.map((r) => (
              <button
                key={r.key}
                onClick={() => pickPersona(r.key)}
                className={`rounded-card border p-3 text-left transition ${
                  risk === r.key
                    ? "border-[color:var(--color-lime)] bg-[color:var(--color-lime)]/10"
                    : "border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
                }`}
              >
                <p className="font-display text-[14px] font-bold text-fg">{r.label}</p>
                <p className="mt-1 text-[11px] leading-tight text-muted">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* strategy prompt */}
      <Reveal delay={0.1}>
        <div className="flex flex-col gap-2">
          <Label>Strategy prompt</Label>
          <Card className="p-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Tell your agent how to trade. e.g. 'Trade ETH and WETH momentum, scale in on breakouts, never risk more than 10% per position…'"
              className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-fg outline-none placeholder:text-dim"
            />
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[color:var(--color-line)] pt-3">
              {TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(t)}
                  className="inline-flex items-center gap-1 rounded-pill bg-[color:var(--color-surface-2)] px-2.5 py-1 text-[11px] font-medium text-muted transition hover:text-fg"
                >
                  <Sparkles className="h-3 w-3" /> Template {i + 1}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="flex items-center gap-2 rounded-card border border-[color:var(--color-line)] px-4 py-3 text-[12.5px] text-muted">
          <Cpu className="h-4 w-4 shrink-0 text-[color:var(--color-lime)]" />
          Runs on TradeRoyale infra — no API keys needed. Your agent goes live automatically at the bell.
        </div>
      </Reveal>

      <div className="flex-1" />

      <Reveal delay={0.14}>
        <div className="flex flex-col gap-2">
          {error && <p className="text-center text-[12.5px] text-[color:var(--color-loss)]">{error}</p>}
          <Button fullWidth variant={hasStrategy ? "dark" : "lime"} onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Spinner /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 text-[color:var(--color-profit)]" /> Saved
              </>
            ) : hasStrategy ? (
              "Update agent"
            ) : (
              "Lock in agent"
            )}
          </Button>
          {hasStrategy && (
            <Button fullWidth onClick={() => router.push(`/match/${params.id}/live`)}>
              {live ? "Enter The Arena" : "Preview The Arena"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</span>
  );
}
