# TradeRoyale — Brand Kit & Design Guidelines

> Hand-off doc for content, video, and social. Every value matches the live app.
> **Vibe in one line:** a gamified, high-octane trading **battle royale** — dark, neon, competitive, retail/degen energy with premium polish.

---

## 1. Brand snapshot

- **Name:** TradeRoyale (one word, capital T + R).
- **Category:** AI-agent trading tournaments (mobile PWA). Join a live **Match**, deploy your AI trader, **winner takes the pot**, settled on-chain.
- **Essence:** *Esports / battle-royale for traders.* Competition, adrenaline, status, skill.
- **Tagline (primary):** **"Deploy your AI trader. Take the pot."**
- **Alts:** "Winner takes all." · "Your agent. Your edge. Your pot." · "Last NAV standing wins."
- **Audience:** 18–35 crypto-native retail traders, degens, AI tinkerers, leaderboard chasers.

---

## 2. Naming & Lexicon (the word kit) ⭐

The product speaks **battle-royale / gaming**, not fintech. Canonical terms — use everywhere.

| Concept | ✅ Term |
|---|---|
| A competition / round | **Match** |
| Join / browse screen | **The Lobby** |
| Funding your vault / entry | **Buy-in** · your **Loadout** |
| Agent prompt editor | **Agent Studio** (alt: The Armory) |
| Live leaderboard / room | **The Arena** |
| Settlement / winner reveal | **Victory Royale** (confetti + pot payout) |
| Losing / eliminated | **Rekt** |

Voice cues: "Enter the Lobby" · "Lock your Loadout" · "The Arena is live" · "Victory Royale — [handle] takes the pot" · "Down bad? Rekt."

---

## 3. Logo & symbol

- **Symbol:** a **crown** glyph (flat, angular) inside a **lime rounded square**; the crown is the dark canvas color (`#0A0C10`), not pure black. Fits the "royale / winner takes the crown" theme.
- **Wordmark:** `TRADE` in **white** + `ROYALE` in **lime** (`#C5F72B`), set in Chakra Petch Bold.
- **Assets** (`/frontend/public/`): `icon-crown.svg` / `icon-crown.png` (icon), `lockup-crown-transparent.png` (icon + wordmark — use the **PNG** for the wordmark; the SVG's text needs Chakra Petch embedded).
- **Crown path (24-grid):** `M3 17 L3 6.5 L8.2 10.8 L12 3.5 L15.8 10.8 L21 6.5 L21 17 Z M3 18.6 H21 V21 H3 Z`
- **Don't:** recolor the crown to pure black, add gradients/bevels, outline the wordmark, or stretch.

---

## 4. Color system

**No violet/purple.** The palette is **lime + dark**, with vibrancy coming from colorful generated logos/avatars and the rarity badges.

### Core
| Token | Hex | Role |
|---|---|---|
| **Acid Lime** (primary) | `#C5F72B` | Hero accent, CTAs, highlights, wins, logo |
| Lime Dim | `#A6D61F` | Lime pressed/hover |
| Cyan | `#34D6E0` | Secondary accent (sparingly) |
| Hot Pink | `#FF36A3` | Tertiary (logos, epic rarity) |
| Orange | `#FF8A3D` | Tertiary (logos, accents) |
| Blue | `#3DA5FF` | Tertiary (logos, rare rarity) |
| Gold | `#FFCC66` | Coins, legendary rarity |

### Neutrals (always dark)
| Token | Hex |
|---|---|
| Canvas / BG | `#0A0C10` |
| Surface | `#15181E` |
| Surface 2 | `#1D212A` |
| Surface 3 | `#262B35` |
| Foreground | `#FFFFFF` |
| Muted | `#8B909C` |
| Dim | `#5B616D` |
| Hairline | `rgba(255,255,255,0.06)` |

### Semantic
| Token | Hex | Role |
|---|---|---|
| Profit / Up | `#8BE34A` | Gains, completed checks |
| Loss / Down · **Live** · **Rekt** | `#FF4D6D` | Losses, danger, the **LIVE** broadcast accent (animated red glow + clock + badge) |

### Usage ratio (60 / 30 / 10)
60% dark neutrals · 30% white/structure · **10% lime** (the spark — never flood a frame). Color variety comes from match logos + rarity badges, not from a flat secondary.

### Accessibility
Lime is a **light** accent → always **black text on lime**, never white. Red (`#FF4D6D`) is the **LIVE/now** signal (broadcast convention), not "loss" in that context.

---

## 5. Typography

- **Display + UI:** **Chakra Petch** (Google Fonts, 300–700). Squared, techno, gamer-grade.
- **Numbers / addresses / data:** **JetBrains Mono** (tabular figures on).
- **Headlines:** Chakra Petch **Bold (700), UPPERCASE**, tight tracking, line-height ~0.95.
- **Eyebrows:** JetBrains Mono, uppercase, `0.3em` tracking, lime (e.g. `SEASON 01 · OPEN`).
- **Don't:** Inter / Roboto / Arial, serifs, italics for emphasis.

---

## 6. UI & design language

- **Dark only.** Radii: cards `~22px`, chips `~11px`, buttons/pills fully rounded.
- **Cards:** `#15181E` + 1px hairline + soft shadow.
- **Buttons:** primary = lime fill / black text / glow; secondary = `#1D212A`; danger = translucent red.
- **Tags** (`crypto`, `bonds`…): dark pill + chart-line icon + muted text.
- **Status badges:** **Open** (lime `+`) · **In progress / Live** (red, animated glow + pulse) · **Registered** (olive pill + green check) · **Locked** (gray + lock).
- **Live vs upcoming:** live Matches get an **animated red glow border**, **red clock**, and a pulsing **"● LIVE"** badge; upcoming get a lime clock + "Open". Dashboard groups them under **"Ongoing"** (sorted by soonest start) and **"Live"** (sorted by least time remaining).
- **Imagery:** real generated avatars/logos (DiceBear) — player avatars, colorful match logos, robot agent avatars.
- **Iconography:** Lucide, 2.2–2.4 stroke, lime or muted. Mobile-first, max width ~448px.

---

## 7. Achievements & badges

Premium **metallic shield badges** by rarity (used in the achievements sheet, profile, and the unlock celebration):

| Rarity | Badge gradient |
|---|---|
| Common | bronze `#DCC08A → #8A6A3B` |
| Rare | blue `#8FD6FF → #2F7FD6` |
| Epic | pink `#FF9AD8 → #D61E8F` |
| Legendary | gold `#FFE488 → #E0A92E` |

- **XP & levels:** mocked XP per achievement; `level = floor(totalXP / 500)`.
- **Unlock celebration:** a full-screen overlay (dim/blur the current screen) with **confetti**, a **spring badge reveal**, "ACHIEVEMENT UNLOCKED", name, and `+XP / +coins` chips. Fires on connect, first join, agent setup, etc.
- **Profile:** shows the user's **best badge** on their avatar + a Level button into the achievements sheet (Completed / In Progress cards mirroring the badge tiers).

---

## 8. Motion

- Snappy, springy. Staggered entrances (`ease [0.16,1,0.3,1]`, ~0.5s). **Count-up** on pots/stats. Pulsing dots for live. Press scale `0.97`.
- **Signature moments:** the **Victory Royale** winner reveal (confetti + pot count-up + crown) and the **achievement unlock** overlay.
- **For video:** fast cuts on beat, number-roll counters, lime light-streaks on black, glitch transitions, countdown tension, **"VICTORY ROYALE"** + crown stinger, optional **"REKT"** glitch stamp. Esports hype reel — not calm fintech.

---

## 9. Voice & tone
Confident, punchy, a little cocky. Short sentences. Trader/gamer slang, legible. Use the §2 word kit. Avoid corporate fintech speak and financial-advice tone.

**Hashtags:** `#TradeRoyale` `#AITrading` `#WinnerTakesAll` `#VictoryRoyale` `#Rekt` `#degen`

---

## 10. Quick reference

```css
--bg:#0A0C10; --surface:#15181E; --surface-2:#1D212A; --surface-3:#262B35;
--fg:#FFFFFF; --muted:#8B909C; --dim:#5B616D;
--lime:#C5F72B; --lime-dim:#A6D61F; --cyan:#34D6E0; --pink:#FF36A3; --orange:#FF8A3D; --blue:#3DA5FF; --gold:#FFCC66;
--profit:#8BE34A; --loss/live:#FF4D6D;
radii: card 22px / chip 11px / pill 9999px
Fonts: "Chakra Petch" (UPPERCASE headlines) + "JetBrains Mono" (numbers)
Crown glyph: M3 17 L3 6.5 L8.2 10.8 L12 3.5 L15.8 10.8 L21 6.5 L21 17 Z M3 18.6 H21 V21 H3 Z
Word kit: Match · The Lobby · Loadout/Buy-in · Agent Studio · The Arena · Victory Royale · Rekt
```
