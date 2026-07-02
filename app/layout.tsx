import type { Metadata, Viewport } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AppProvider } from "@/components/AppState";
import Nav from "@/components/Nav";
import SkipLink from "@/components/SkipLink";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import CommandPalette from "@/components/CommandPalette";
import FocusSession from "@/components/FocusSession";
import Shortcuts from "@/components/Shortcuts";
import { Celebrate } from "@/components/Celebrate";
import Onboarding from "@/components/Onboarding";
import { AuthProvider } from "@/components/auth/AuthProvider";
import AuthDialog from "@/components/auth/AuthDialog";
import { NotesProvider } from "@/components/notes/NotesProvider";

export const metadata: Metadata = {
  title: "Matemonstro — da base ao mestrado",
  description:
    "Guia de estudos interativo de matematica pura: fundacoes ao avancado, com revisao espacada.",
  manifest: "/manifest.webmanifest",
  applicationName: "Matemonstro",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Matemonstro" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0d14",
  colorScheme: "dark",
};

// Script inline: aplica o tema salvo (localStorage 'mm:theme') ANTES da
// hidratação para evitar flash de cor. Fallback 'dark'.
const themeInit = `try{var t=localStorage.getItem('mm:theme')||'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <SkipLink />
        <AuthProvider>
          <NotesProvider>
            <AppProvider>
              <ServiceWorkerRegister />
              <CommandPalette />
              <FocusSession />
              <Shortcuts />
              <Celebrate>
                <div className="min-h-screen md:flex">
                  <Nav />
                  <main
                    id="conteudo"
                    tabIndex={-1}
                    className="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-10 max-w-5xl mx-auto w-full"
                  >
                    {children}
                  </main>
                </div>
                <Onboarding />
              </Celebrate>
            </AppProvider>
          </NotesProvider>
          <AuthDialog />
        </AuthProvider>
      </body>
    </html>
  );
}
