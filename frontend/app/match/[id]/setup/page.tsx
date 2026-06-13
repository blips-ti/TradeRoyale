"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Check, Cpu, Sparkles } from "lucide-react";
import { useGame, type AgentConfig } from "@/app/_lib/store";
import { getMatchBase, resolveMatch } from "@/app/_lib/matches";
import { handleFor } from "@/app/_lib/format";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { AppShell } from "@/app/_components/AppShell";
import { BotAvatar, Button, Card, Reveal } from "@/app/_components/ui";

const RISKS: { key: AgentConfig["risk"]; label: string; desc: string }[] = [
  { key: "sniper", label: "Sniper", desc: "Patient. Few, high-conviction entries." },
  { key: "balanced", label: "Balanced", desc: "Measured risk, steady compounding." },
  { key: "degen", label: "Degen", desc: "Max aggression. Send it." },
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
  const { anchorAt, joinedMatchId, agent, setAgent, init } = useGame();
  const now = useNow(1000);

  useEffect(() => init(), [init]);

  const base = getMatchBase(params.id);
  const joined = joinedMatchId === params.id;

  const [name, setName] = useState(agent?.name ?? "");
  const [risk, setRisk] = useState<AgentConfig["risk"]>(agent?.risk ?? "balanced");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [saved, setSaved] = useState(false);

  // default agent name from wallet-derived handle
  useEffect(() => {
    if (!name && joinedMatchId) setName(`${handleFor(joinedMatchId)}-bot`);
  }, [name, joinedMatchId]);

  if (!base || !anchorAt || !now) return null;
  if (!joined) {
    return (
      <Card className="mt-4 p-8 text-center text-muted">
        Register for this Match first.
      </Card>
    );
  }

  const match = resolveMatch(base, anchorAt, now);

  const save = () => {
    setAgent({ name: name.trim() || "Agent", risk, prompt: prompt.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const isReady = !!agent;

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      <Reveal>
        <div className="flex items-center gap-2 px-1">
          <BotAvatar seed={agent?.name || params.id} size={38} />
          <div>
            <h1 className="font-display text-[22px] font-bold uppercase leading-none tracking-tight">
              Agent Studio
            </h1>
            <p className="text-[12.5px] text-muted">{match.name} · loadout setup</p>
          </div>
        </div>
      </Reveal>

      {/* countdown */}
      <Reveal delay={0.04}>
        <Card className="flex items-center justify-between p-4">
          <span className="text-[13px] text-muted">Match starts in</span>
          <span className="font-mono text-[20px] font-bold text-[color:var(--color-lime)] tnum">
            {formatDelta(match.startsAt - now)}
          </span>
        </Card>
      </Reveal>

      {/* agent name */}
      <Reveal delay={0.06}>
        <Field label="Agent name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your trader"
            className="w-full bg-transparent font-display text-[16px] font-semibold text-fg outline-none placeholder:text-dim"
          />
        </Field>
      </Reveal>

      {/* risk persona */}
      <Reveal delay={0.08}>
        <div className="flex flex-col gap-2">
          <Label>Persona</Label>
          <div className="grid grid-cols-3 gap-2">
            {RISKS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRisk(r.key)}
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
              placeholder="Tell your agent how to trade. e.g. 'Trade ETH and SOL momentum, scale in on breakouts, never risk more than 10% per position…'"
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
          <Button fullWidth variant={isReady ? "dark" : "lime"} onClick={save}>
            {saved ? (
              <>
                <Check className="h-4 w-4 text-[color:var(--color-profit)]" /> Saved
              </>
            ) : isReady ? (
              "Update agent"
            ) : (
              "Lock in agent"
            )}
          </Button>
          {isReady && (
            <Button fullWidth onClick={() => router.push(`/match/${match.id}/live`)}>
              {match.status === "live" ? "Enter The Arena" : "Preview The Arena"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Card className="px-4 py-3.5">{children}</Card>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</span>
  );
}
