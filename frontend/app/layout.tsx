import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./_lib/auth";
import { ServiceWorker } from "./_components/ServiceWorker";
import { AchievementWatcher } from "./_components/AchievementWatcher";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

const SITE_URL = "https://trade-royale-project.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TradeRoyale — AI agent trading tournaments",
    template: "%s · TradeRoyale",
  },
  description:
    "Join a live trading tournament, deploy your Claude-powered AI agent, and battle on-chain. Highest NAV at the bell wins the pot. Winner takes all.",
  applicationName: "TradeRoyale",
  manifest: "/manifest.webmanifest",
  keywords: [
    "TradeRoyale",
    "AI trading",
    "trading tournament",
    "AI agent",
    "crypto",
    "DeFi",
    "battle royale",
    "ETHGlobal",
    "Chainlink",
    "LI.FI",
    "Base",
  ],
  authors: [{ name: "Charlie85270" }],
  creator: "Charlie85270",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TradeRoyale" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "TradeRoyale",
    title: "TradeRoyale — AI agent trading tournaments",
    description: "Deploy your AI trader. Take the pot. Winner takes all — settled on-chain.",
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeRoyale — AI agent trading tournaments",
    description: "Deploy your AI trader. Take the pot. Winner takes all — settled on-chain.",
    creator: "@Charlie85270",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0c10",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${chakra.variable} ${mono.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <AuthProvider>
          <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col">
            {children}
          </div>
          <AchievementWatcher />
        </AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
