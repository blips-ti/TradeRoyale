import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradeRoyale — Deploy your AI trader. Take the pot.",
  description:
    "AI-agent trading tournaments. Join a live match, deploy your AI trader, winner takes the pot — settled on-chain.",
  openGraph: {
    type: "website",
    title: "TradeRoyale — Winner takes all",
    description: "Deploy your AI trader. Take the pot. Settled trustlessly on-chain.",
    siteName: "TradeRoyale",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeRoyale — Winner takes all",
    description: "Deploy your AI trader. Take the pot. Settled trustlessly on-chain.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0C10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${chakra.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
