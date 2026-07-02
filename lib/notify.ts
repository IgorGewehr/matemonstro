/*
 * Notificações locais de revisão (client-only).
 *
 * Não requer servidor nem push: usa a Notification API do navegador. O marcador
 * "já notifiquei hoje" fica em localStorage (chave abaixo) para garantir no
 * máximo um lembrete por dia — não toca no IndexedDB.
 */

const LAST_NOTIFIED_KEY = "mm:lastNotifiedDay";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A Notification API está disponível neste ambiente? */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Permissão atual ('default' | 'granted' | 'denied'); 'denied' se não suportado. */
export function notificationPermission(): NotificationPermission {
  if (!notificationsSupported()) return "denied";
  return Notification.permission;
}

/**
 * Pede permissão para notificar. Retorna o status resultante. Seguro chamar
 * mesmo se já concedida/negada (retorna o estado atual sem repromptar).
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Safari antigo usa callback; ignoramos e reportamos o estado atual.
    return Notification.permission;
  }
}

/**
 * Dispara um lembrete local de revisões vencidas, no máximo uma vez por dia.
 * No-op se a permissão não estiver concedida, se não houver revisões, ou se já
 * notificou hoje. Retorna true se de fato notificou.
 */
export function notifyDueReviews(dueCount: number): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  if (!dueCount || dueCount <= 0) return false;

  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_NOTIFIED_KEY);
  } catch {
    last = null;
  }
  const today = todayKey();
  if (last === today) return false;

  try {
    const plural = dueCount === 1 ? "revisão" : "revisões";
    new Notification("Matemonstro — hora de revisar", {
      body: `Você tem ${dueCount} ${plural} vencida${dueCount === 1 ? "" : "s"}. Um teorema por vez.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "mm-due-reviews",
      lang: "pt-BR",
    });
  } catch {
    return false;
  }

  try {
    localStorage.setItem(LAST_NOTIFIED_KEY, today);
  } catch {
    /* ignora quota/privacidade */
  }
  return true;
}
