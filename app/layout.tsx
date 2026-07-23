import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suivi pionnier",
  description: "Suivi quotidien de votre progression vers l’objectif annuel de 600 heures.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
