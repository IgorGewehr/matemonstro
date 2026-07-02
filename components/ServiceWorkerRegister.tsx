"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/AppState";
import { dueCards } from "@/lib/srs";
import { notifyDueReviews } from "@/lib/notify";

/**
 * Registra o service worker (PWA/offline) e, ao abrir o app com "Lembretes de
 * revisão" ativados, dispara — no máximo uma vez por dia — uma notificação
 * local com o número de revisões vencidas. Renderizado dentro de <AppProvider>,
 * então tem acesso a cards/settings via useApp().
 */
export default function ServiceWorkerRegister() {
  const { ready, cards, settings } = useApp();
  const notified = useRef(false);

  // Registro do SW (uma vez).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((e) => console.warn("Falha ao registrar o service worker", e));
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // Aplica o tema persistido em todo o app (não só na página de config) e o
  // espelha em localStorage para o script inline do layout evitar flash.
  useEffect(() => {
    if (!ready) return;
    const theme = settings.theme ?? "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("mm:theme", theme);
    } catch {
      /* ignora */
    }
  }, [ready, settings.theme]);

  // Lembrete de revisões ao abrir (client-only, após carregar os dados).
  useEffect(() => {
    if (!ready || notified.current) return;
    if (!settings.notifications) return;
    const due = dueCards(cards, Date.now()).length;
    if (due <= 0) return;
    notified.current = true;
    notifyDueReviews(due);
  }, [ready, cards, settings.notifications]);

  return null;
}
