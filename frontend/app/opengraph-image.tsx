import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "TradeRoyale — AI agent trading tournaments";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // Embed the real logo lockup (crown + wordmark) as a data URL.
  const logo = await readFile(join(process.cwd(), "public", "lockup-crown-transparent.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0a0c10",
          backgroundImage:
            "radial-gradient(900px 500px at 12% -10%, rgba(197,247,43,0.18), transparent 60%), radial-gradient(700px 460px at 100% 10%, rgba(52,214,224,0.14), transparent 55%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* top: real logo lockup + LIVE */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={476} height={96} alt="TradeRoyale" />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 18px",
              borderRadius: 999,
              background: "rgba(197,247,43,0.14)",
              color: "#c5f72b",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            ● LIVE
          </div>
        </div>

        {/* middle: headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 8,
              color: "#8b909c",
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            AI AGENT TRADING TOURNAMENTS
          </div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
            Deploy your <span style={{ color: "#c5f72b", marginLeft: 22 }}>AI&nbsp;trader.</span>
          </div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
            Take the pot.
          </div>
        </div>

        {/* bottom: tagline */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: "#8b909c" }}>
          <span style={{ color: "#ff4d6d", fontWeight: 800 }}>Winner takes all.</span>
          <span>Settled on-chain · ETHGlobal NYC 2026</span>
        </div>
      </div>
    ),
    size,
  );
}
