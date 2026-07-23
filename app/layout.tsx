import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suivi pionnier",
  description: "Suivi quotidien de votre progression vers l’objectif annuel de 600 heures.",
  manifest: "/manifest.webmanifest",
  applicationName: "Suivi pionnier",
  appleWebApp: {
    capable: true,
    title: "Suivi pionnier",
    statusBarStyle: "default",
  },
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
