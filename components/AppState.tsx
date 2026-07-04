"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Progress,
  Card,
  Settings,
  SubStatus,
  StudyLogEntry,
  ExerciseAttempt,
  ExerciseMark,
  ReviewEvent,
} from "@/lib/types";
import {
  loadSnapshot,
  putProgress,
  putCards,
  putCard,
  saveSettings,
  putLog,
  putAttempt,
  putMark,
  deleteMark,
  putEvent,
  defaultSettings,
  exportAll,
  importAll,
  resetAll,
  markDirty,
  setMeta,
  getAllMeta,
  getOutbox,
  clearOutboxEntries,
} from "@/lib/store";
import { getSubRef, loadCurriculum } from "@/lib/curriculum";
import { trackProgress } from "@/lib/scheduler";
import { computeXp, levelFor } from "@/lib/gamification";
import { computeInsignias } from "@/lib/insignias";
import { newCard, review as srsReview, DAY, type Grade } from "@/lib/srs";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  pullState,
  pushState,
  mergeDomain,
  mergeSingleton,
  stripUpdatedAt,
  createPushScheduler,
  isOnline,
  type StatePatch,
  type SyncStatus,
  type Synced,
} from "@/lib/sync";

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// Chave de sincronizacao (`${domain}::${itemKey}`), espelhando o helper
// privado de lib/store.ts — usada apenas para consultar o mapa de meta local.
function syncKey(domain: string, itemKey: string): string {
  return `${domain}::${itemKey}`;
}

interface AppCtx {
  ready: boolean;
  progress: Map<string, Progress>;
  cards: Card[];
  settings: Settings;
  log: Map<string, StudyLogEntry>;
  attempts: Map<string, ExerciseAttempt>;
  marks: Map<string, ExerciseMark>;
  events: ReviewEvent[];
  syncStatus: SyncStatus;
  setStatus: (subId: string, status: SubStatus) => Promise<void>;
  saveNotes: (subId: string, notes: string, keyPoints: string) => Promise<void>;
  gradeCard: (card: Card, grade: Grade) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  seedCards: (subId: string) => Promise<void>;
  recordAttempt: (a: ExerciseAttempt) => Promise<void>;
  setMark: (key: string, patch: Partial<ExerciseMark>) => Promise<void>;
  toggleFavorite: (subId: string) => Promise<void>;
  recordReviewEvent: (e: ReviewEvent) => Promise<void>;
  logStudy: (minutes: number) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (json: string) => Promise<void>;
  wipe: () => Promise<void>;
}

// Convencao de chave para a marca de favorito de um subtopico.
const favKey = (subId: string) => `fav::${subId}`;

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [cards, setCards] = useState<Card[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [log, setLog] = useState<Map<string, StudyLogEntry>>(new Map());
  const [attempts, setAttempts] = useState<Map<string, ExerciseAttempt>>(new Map());
  const [marks, setMarks] = useState<Map<string, ExerciseMark>>(new Map());
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("disabled");
  const cardIds = useRef<Set<string>>(new Set());

  // ---- Sincronizacao com o servidor (offline-first; ver lib/sync.ts) ----
  // Deslogado: nada abaixo executa e o app se comporta 100% como antes
  // (somente IndexedDB). Logado: pull+merge LWW no login, push com debounce
  // a cada mutacao, flush automatico ao reconectar.
  const auth = useAuth();
  const authUserId = auth.user?.id ?? null;
  const prevUserIdRef = useRef<string | null>(null);
  const flushRef = useRef<() => void>(() => {});
  const schedulerRef = useRef(createPushScheduler(() => flushRef.current(), 1500));

  async function flush() {
    if (!authUserId) return; // sem sessao: outbox fica intacta para o proximo login
    if (!isOnline()) return;
    const entries = await getOutbox();
    if (!entries.length) return;
    setSyncStatus("syncing");
    try {
      const snap = await loadSnapshot();
      const metaList = await getAllMeta();
      const metaMap = new Map(metaList.map((m) => [m.key, m.updatedAt]));
      const byDomain = new Map<string, Set<string>>();
      for (const e of entries) {
        const set = byDomain.get(e.domain) ?? new Set<string>();
        set.add(e.itemKey);
        byDomain.set(e.domain, set);
      }

      function withUpdatedAt<T extends object>(item: T, domain: string, key: string): Synced<T> {
        return { ...item, updatedAt: metaMap.get(syncKey(domain, key)) ?? Date.now() } as Synced<T>;
      }

      const patch: StatePatch = {};

      const progressKeys = byDomain.get("progress");
      if (progressKeys) {
        const progressMap = new Map(snap.progress.map((p) => [p.id, p]));
        const items = Array.from(progressKeys)
          .map((k) => progressMap.get(k))
          .filter((p): p is Progress => !!p);
        if (items.length) patch.progress = items.map((p) => withUpdatedAt(p, "progress", p.id));
      }

      const cardKeys = byDomain.get("cards");
      if (cardKeys) {
        const cardMap = new Map(snap.cards.map((c) => [c.id, c]));
        const items = Array.from(cardKeys)
          .map((k) => cardMap.get(k))
          .filter((c): c is Card => !!c);
        if (items.length) patch.cards = items.map((c) => withUpdatedAt(c, "cards", c.id));
      }

      const logKeys = byDomain.get("studylog");
      if (logKeys) {
        const logMap = new Map(snap.log.map((l) => [l.day, l]));
        const items = Array.from(logKeys)
          .map((k) => logMap.get(k))
          .filter((l): l is StudyLogEntry => !!l);
        if (items.length) patch.studylog = items.map((l) => withUpdatedAt(l, "studylog", l.day));
      }

      const attemptKeys = byDomain.get("attempts");
      if (attemptKeys) {
        const attemptMap = new Map(snap.attempts.map((a) => [a.id, a]));
        const items = Array.from(attemptKeys)
          .map((k) => attemptMap.get(k))
          .filter((a): a is ExerciseAttempt => !!a);
        if (items.length) patch.attempts = items.map((a) => withUpdatedAt(a, "attempts", a.id));
      }

      const markKeys = byDomain.get("marks");
      if (markKeys) {
        const markMap = new Map(snap.marks.map((m) => [m.key, m]));
        const items = Array.from(markKeys)
          .map((k) => markMap.get(k))
          .filter((m): m is ExerciseMark => !!m);
        if (items.length) patch.marks = items.map((m) => withUpdatedAt(m, "marks", m.key));
      }

      const eventKeys = byDomain.get("events");
      if (eventKeys) {
        const eventMap = new Map(snap.events.map((e) => [e.id, e]));
        const items = Array.from(eventKeys)
          .map((k) => eventMap.get(k))
          .filter((e): e is ReviewEvent => !!e);
        if (items.length) patch.events = items.map((e) => withUpdatedAt(e, "events", e.id));
      }

      if (byDomain.has("settings")) {
        patch.settings = withUpdatedAt(snap.settings, "settings", "");
      }

      const res = await pushState(patch);
      if (res) await clearOutboxEntries(entries.map((e) => e.id));
      setSyncStatus("idle");
    } catch (err) {
      console.error("Falha ao sincronizar com o servidor (push)", err);
      setSyncStatus("error");
    }
  }
  flushRef.current = flush;

  async function syncOnLogin() {
    setSyncStatus("syncing");
    try {
      const pulled = await pullState();
      if (!pulled) {
        setSyncStatus("idle");
        return;
      }
      const now = Date.now();
      const metaList = await getAllMeta();
      const metaByDomain = (domain: string) => {
        const m = new Map<string, number>();
        for (const row of metaList) if (row.domain === domain) m.set(row.itemKey, row.updatedAt);
        return m;
      };

      // progress
      {
        const { merged, dirty } = mergeDomain(
          (p: Progress) => p.id,
          progress,
          metaByDomain("progress"),
          pulled.progress,
          now
        );
        const nextMap = new Map<string, Progress>();
        for (const [key, item] of merged) {
          const plain = stripUpdatedAt<Progress>(item);
          nextMap.set(key, plain);
          await putProgress(plain);
          if (dirty.includes(key)) await markDirty("progress", key, item.updatedAt);
          else await setMeta("progress", key, item.updatedAt);
        }
        setProgress(nextMap);
      }

      // cards
      {
        const localCardMap = new Map(cards.map((c) => [c.id, c]));
        const { merged, dirty } = mergeDomain(
          (c: Card) => c.id,
          localCardMap,
          metaByDomain("cards"),
          pulled.cards,
          now
        );
        const nextArr: Card[] = [];
        const toBulkPut: Card[] = [];
        for (const [key, item] of merged) {
          const plain = stripUpdatedAt<Card>(item);
          nextArr.push(plain);
          toBulkPut.push(plain);
          cardIds.current.add(key);
          if (dirty.includes(key)) await markDirty("cards", key, item.updatedAt);
          else await setMeta("cards", key, item.updatedAt);
        }
        if (toBulkPut.length) await putCards(toBulkPut);
        setCards(nextArr);
      }

      // studylog
      {
        const { merged, dirty } = mergeDomain(
          (l: StudyLogEntry) => l.day,
          log,
          metaByDomain("studylog"),
          pulled.studylog,
          now
        );
        const nextMap = new Map<string, StudyLogEntry>();
        for (const [key, item] of merged) {
          const plain = stripUpdatedAt<StudyLogEntry>(item);
          nextMap.set(key, plain);
          await putLog(plain);
          if (dirty.includes(key)) await markDirty("studylog", key, item.updatedAt);
          else await setMeta("studylog", key, item.updatedAt);
        }
        setLog(nextMap);
      }

      // attempts
      {
        const { merged, dirty } = mergeDomain(
          (a: ExerciseAttempt) => a.id,
          attempts,
          metaByDomain("attempts"),
          pulled.attempts,
          now
        );
        const nextMap = new Map<string, ExerciseAttempt>();
        for (const [key, item] of merged) {
          const plain = stripUpdatedAt<ExerciseAttempt>(item);
          nextMap.set(key, plain);
          await putAttempt(plain);
          if (dirty.includes(key)) await markDirty("attempts", key, item.updatedAt);
          else await setMeta("attempts", key, item.updatedAt);
        }
        setAttempts(nextMap);
      }

      // marks
      {
        const { merged, dirty } = mergeDomain(
          (m: ExerciseMark) => m.key,
          marks,
          metaByDomain("marks"),
          pulled.marks,
          now
        );
        const nextMap = new Map<string, ExerciseMark>();
        for (const [key, item] of merged) {
          const plain = stripUpdatedAt<ExerciseMark>(item);
          nextMap.set(key, plain);
          await putMark(plain);
          if (dirty.includes(key)) await markDirty("marks", key, item.updatedAt);
          else await setMeta("marks", key, item.updatedAt);
        }
        setMarks(nextMap);
      }

      // events
      {
        const localEventMap = new Map(events.map((e) => [e.id, e]));
        const { merged, dirty } = mergeDomain(
          (e: ReviewEvent) => e.id,
          localEventMap,
          metaByDomain("events"),
          pulled.events,
          now
        );
        const nextArr: ReviewEvent[] = [];
        for (const [key, item] of merged) {
          const plain = stripUpdatedAt<ReviewEvent>(item);
          nextArr.push(plain);
          await putEvent(plain);
          if (dirty.includes(key)) await markDirty("events", key, item.updatedAt);
          else await setMeta("events", key, item.updatedAt);
        }
        setEvents(nextArr);
      }

      // settings (blob singleto)
      {
        const localUpdatedAt = metaList.find((m) => m.domain === "settings" && m.itemKey === "")?.updatedAt;
        const { merged: mergedSettings, dirty: settingsDirty } = mergeSingleton(
          settings,
          localUpdatedAt,
          pulled.settings,
          now
        );
        if (mergedSettings) {
          const plain = { ...defaultSettings, ...stripUpdatedAt<Settings>(mergedSettings) };
          await saveSettings(plain);
          setSettings(plain);
          if (settingsDirty) await markDirty("settings", "", mergedSettings.updatedAt);
          else await setMeta("settings", "", mergedSettings.updatedAt);
        }
      }

      schedulerRef.current.flushNow();
      setSyncStatus("idle");
    } catch (err) {
      console.error("Falha ao sincronizar com o servidor (pull)", err);
      setSyncStatus("error");
    }
  }

  // Dispara o pull+merge quando o usuario loga (transicao null -> user).
  // Quando desloga, apenas desativa o indicador (dados locais continuam
  // intactos e a outbox permanece para o proximo login).
  useEffect(() => {
    if (!ready) return;
    const prevUid = prevUserIdRef.current;
    prevUserIdRef.current = authUserId;
    if (authUserId && authUserId !== prevUid) {
      syncOnLogin();
    } else if (!authUserId) {
      schedulerRef.current.cancel();
      setSyncStatus("disabled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, ready]);

  // Flush automatico ao reconectar (mudancas feitas offline sao enviadas).
  useEffect(() => {
    function handleOnline() {
      if (authUserId) schedulerRef.current.flushNow();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [authUserId]);

  // Celebracao de level-up: detecta subida de nivel de XP a partir de QUALQUER
  // mutacao (subtopico, revisao, anotacao) num unico ponto. O XP e derivado, sem
  // schema novo. O ref evita celebrar na hidratacao inicial (prev = null).
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    const info = levelFor(computeXp({ progress, cards, log, settings }));
    const prev = prevLevelRef.current;
    prevLevelRef.current = info.level;
    if (prev !== null && info.level > prev && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mm:celebrate", {
          detail: { type: "levelup", levelName: info.name, level: info.level },
        })
      );
    }
  }, [ready, progress, cards, log, settings]);

  // Celebracao de insignia (Matematico Nivel 1-5): mesma mecanica do level-up —
  // derivado puro do progresso, observado num unico ponto, ref evita disparo na
  // hidratacao. Dispara quando TODAS as trilhas das camadas 1..k fecham.
  const prevInsigniaRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    const { mathematicianLevel, tiers } = computeInsignias(progress);
    const prev = prevInsigniaRef.current;
    prevInsigniaRef.current = mathematicianLevel;
    if (prev !== null && mathematicianLevel > prev && typeof window !== "undefined") {
      const tier = tiers.find((t) => t.level === mathematicianLevel);
      window.dispatchEvent(
        new CustomEvent("mm:celebrate", {
          detail: {
            type: "insignia",
            level: mathematicianLevel,
            levelName: tier?.name ?? `Matemático Nível ${mathematicianLevel}`,
          },
        })
      );
    }
  }, [ready, progress]);

  // Marca um item como modificado (meta + outbox) e, se logado e online,
  // agenda o push com debounce. Chamado de toda mutacao local abaixo.
  function queueSync(domain: string, itemKey: string, updatedAt: number) {
    markDirty(domain, itemKey, updatedAt).catch((err) =>
      console.error("Falha ao enfileirar mudanca para sincronizacao", err)
    );
    if (authUserId) schedulerRef.current.schedule();
  }

  // Desktop: snapshot diário do estado em vault/.matemonstro/backups/ (a
  // função é no-op fora do Tauri e nunca lança).
  useEffect(() => {
    if (!ready) return;
    import("@/lib/state-backup").then((m) => m.maybeBackupState());
  }, [ready]);

  useEffect(() => {
    let alive = true;
    // Currículo (fetch/IDB) e snapshot local carregam em paralelo; o app só
    // fica ready com ambos — todo o resto do código lê o currículo síncrono.
    Promise.all([loadSnapshot(), loadCurriculum()]).then(([snap]) => {
      if (!alive) return;
      setProgress(new Map(snap.progress.map((p) => [p.id, p])));
      setCards(snap.cards);
      cardIds.current = new Set(snap.cards.map((c) => c.id));
      setSettings(snap.settings);
      setLog(new Map(snap.log.map((l) => [l.day, l])));
      setAttempts(new Map(snap.attempts.map((a) => [a.id, a])));
      setMarks(new Map(snap.marks.map((m) => [m.key, m])));
      setEvents(snap.events);
      setReady(true);
    }).catch((e) => {
      console.error("Falha ao carregar dados locais", e);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function seedCards(subId: string) {
    const ref = getSubRef(subId);
    if (!ref) return;
    const now = Date.now();

    // Escalonamento de cartoes novos: em vez de despejar todos os flashcards do
    // subtopico vencendo AGORA (pico de revisao no dia seguinte), respeita a cota
    // newCardsPerDay contando os cartoes novos que JA vencem hoje em toda a base.
    // O excedente vence nos proximos dias. A pagina de estudo mostra os flashcards
    // direto (nao filtra por 'due'), entao isto so suaviza a fila de /revisar.
    const quota = Math.max(1, Math.floor(settings.newCardsPerDay ?? 15));
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfToday = startOfDay.getTime() + DAY;
    let newDueToday = 0;
    for (const c of cards) {
      const isNew = c.state === "new" || (c.reps ?? 0) === 0;
      if (isNew && c.due < endOfToday) newDueToday++;
    }

    const fresh: Card[] = [];
    ref.sub.flashcards.forEach((fc, i) => {
      const id = `${subId}::${i}`;
      if (!cardIds.current.has(id)) {
        const card = newCard(subId, ref.track.id, fc, i, now);
        const slot = newDueToday + fresh.length; // posicao entre os novos de hoje
        const dayOffset = Math.floor(slot / quota);
        card.due = dayOffset === 0 ? now : now + dayOffset * DAY;
        fresh.push(card);
        cardIds.current.add(id);
      }
    });
    if (fresh.length) {
      await putCards(fresh);
      setCards((prev) => [...prev, ...fresh]);
      for (const c of fresh) queueSync("cards", c.id, now);
    }
  }

  async function setStatus(subId: string, status: SubStatus) {
    const now = Date.now();
    const prev = progress.get(subId);
    const p: Progress = {
      id: subId,
      status,
      notes: prev?.notes ?? "",
      keyPoints: prev?.keyPoints ?? "",
      startedAt: prev?.startedAt ?? (status !== "todo" ? now : undefined),
      completedAt: status === "done" ? now : prev?.completedAt,
    };
    await putProgress(p);
    queueSync("progress", subId, now);
    const nextMap = new Map(progress).set(subId, p);
    setProgress(nextMap);
    if (status === "doing" || status === "done") await seedCards(subId);

    // Concluir um subtopico conta como dia de estudo (streak) e dispara celebracao.
    if (status === "done" && prev?.status !== "done") {
      await bumpLog(now, 0, 0);
      const ref = getSubRef(subId);
      if (ref && typeof window !== "undefined") {
        const before = trackProgress(ref.track, progress);
        const after = trackProgress(ref.track, nextMap);
        const trackDone = after.done >= after.total && before.done < after.total;
        window.dispatchEvent(
          new CustomEvent("mm:celebrate", {
            detail: {
              type: trackDone ? "track" : "subtopic",
              subId,
              trackId: ref.track.id,
              trackTitle: ref.track.title,
            },
          })
        );
      }
    }
  }

  async function saveNotes(subId: string, notes: string, keyPoints: string) {
    const now = Date.now();
    const prev = progress.get(subId);
    const p: Progress = {
      id: subId,
      status: prev?.status ?? "doing",
      notes,
      keyPoints,
      startedAt: prev?.startedAt ?? now,
      completedAt: prev?.completedAt,
    };
    await putProgress(p);
    queueSync("progress", subId, now);
    setProgress((m) => new Map(m).set(subId, p));
  }

  async function bumpLog(now: number, reviews: number, minutes: number) {
    const day = dayKey(now);
    const existing = log.get(day) ?? { day, minutes: 0, reviews: 0 };
    const entry: StudyLogEntry = {
      day,
      minutes: existing.minutes + minutes,
      reviews: existing.reviews + reviews,
    };
    await putLog(entry);
    queueSync("studylog", day, now);
    setLog((m) => new Map(m).set(day, entry));
  }

  async function gradeCard(card: Card, grade: Grade) {
    const now = Date.now();
    // Meta de retencao do usuario (settings.requestRetention) enfim chega ao
    // agendador: era um knob persistido/sincronizado mas nunca aplicado.
    const updated = srsReview(card, grade, now, { requestRetention: settings.requestRetention });
    await putCard(updated);
    queueSync("cards", updated.id, now);
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    await bumpLog(now, 1, 0.5);
  }

  async function recordAttempt(a: ExerciseAttempt) {
    await putAttempt(a);
    queueSync("attempts", a.id, a.ts || Date.now());
    setAttempts((m) => new Map(m).set(a.id, a));
  }

  async function setMark(key: string, patch: Partial<ExerciseMark>) {
    const now = Date.now();
    const prev = marks.get(key);
    const mark: ExerciseMark = {
      key,
      kind: patch.kind ?? prev?.kind ?? "exercise",
      status: patch.status ?? prev?.status,
      ts: now,
    };
    await putMark(mark);
    queueSync("marks", key, now);
    setMarks((m) => new Map(m).set(key, mark));
  }

  async function toggleFavorite(subId: string) {
    const key = favKey(subId);
    if (marks.has(key)) {
      await deleteMark(key);
      // Nao ha semantica de "delete" no contrato de /api/state (so upsert);
      // a remocao de favorito fica local nesta primeira versao — nao
      // enfileiramos push para nao ressuscitar a marca no servidor.
      setMarks((m) => {
        const next = new Map(m);
        next.delete(key);
        return next;
      });
    } else {
      const now = Date.now();
      const mark: ExerciseMark = { key, kind: "favorite", ts: now };
      await putMark(mark);
      queueSync("marks", key, now);
      setMarks((m) => new Map(m).set(key, mark));
    }
  }

  async function recordReviewEvent(e: ReviewEvent) {
    await putEvent(e);
    queueSync("events", e.id, e.ts || Date.now());
    setEvents((prev) => [...prev, e]);
  }

  async function logStudy(minutes: number) {
    await bumpLog(Date.now(), 0, minutes);
  }

  async function updateSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    queueSync("settings", "", Date.now());
  }

  async function exportData() {
    return exportAll();
  }
  async function importData(json: string) {
    await importAll(json);
    const snap = await loadSnapshot();
    setProgress(new Map(snap.progress.map((p) => [p.id, p])));
    setCards(snap.cards);
    cardIds.current = new Set(snap.cards.map((c) => c.id));
    setSettings(snap.settings);
    setLog(new Map(snap.log.map((l) => [l.day, l])));
    setAttempts(new Map(snap.attempts.map((a) => [a.id, a])));
    setMarks(new Map(snap.marks.map((m) => [m.key, m])));
    setEvents(snap.events);
    // Um import substitui a base local inteira: marca tudo como pendente de
    // push (se logado) para que o servidor reflita o novo estado.
    const now = Date.now();
    for (const p of snap.progress) queueSync("progress", p.id, now);
    for (const c of snap.cards) queueSync("cards", c.id, now);
    for (const l of snap.log) queueSync("studylog", l.day, now);
    for (const a of snap.attempts) queueSync("attempts", a.id, now);
    for (const m of snap.marks) queueSync("marks", m.key, now);
    for (const e of snap.events) queueSync("events", e.id, now);
    queueSync("settings", "", now);
  }
  async function wipe() {
    schedulerRef.current.cancel();
    await resetAll();
    setProgress(new Map());
    setCards([]);
    cardIds.current = new Set();
    setSettings(defaultSettings);
    setLog(new Map());
    setAttempts(new Map());
    setMarks(new Map());
    setEvents([]);
  }

  const value = useMemo<AppCtx>(
    () => ({
      ready,
      progress,
      cards,
      settings,
      log,
      attempts,
      marks,
      events,
      syncStatus,
      setStatus,
      saveNotes,
      gradeCard,
      updateSettings,
      seedCards,
      recordAttempt,
      setMark,
      toggleFavorite,
      recordReviewEvent,
      logStudy,
      exportData,
      importData,
      wipe,
    }),
    [ready, progress, cards, settings, log, attempts, marks, events, syncStatus]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp deve ser usado dentro de <AppProvider>");
  return c;
}
