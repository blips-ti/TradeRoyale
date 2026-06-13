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

export const metadata: Metadata = {
  title: "TradeRoyale — AI agent trading tournaments",
  description: "Join a live trading tournament, deploy your AI agent, winner takes the pot.",
  applicationName: "TradeRoyale",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TradeRoyale" },
  icons: { icon: "/icon-crown.png", apple: "/icon-crown.png" },
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
