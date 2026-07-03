"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppState";
import { tracks as allTracks, isReady } from "@/lib/curriculum";
import {
  notificationsSupported,
  notificationPermission,
  requestNotificationPermission,
} from "@/lib/notify";
import { toAnkiTsv, ankiFileName, ankiCardCount } from "@/lib/anki-export";
import type { Settings } from "@/lib/types";

type Theme = NonNullable<Settings["theme"]>;

const THEMES: { id: Theme; label: string; glyph: string }[] = [
  { id: "dark", label: "Escuro", glyph: "🌑" },
  { id: "light", label: "Claro", glyph: "☀️" },
  { id: "sepia", label: "Sépia", glyph: "📜" },
];

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("mm:theme", theme);
    } catch {
      /* ignora */
    }
  }
}

export default function ConfigPage() {
  const { ready, settings, updateSettings, exportData, importData, wipe } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [ankiTrack, setAnkiTrack] = useState<string>("");

  useEffect(() => {
    setPerm(notificationPermission());
  }, []);

  // Reaplica o tema salvo ao entrar na página (a camada inline no layout já
  // pinta antes; isto garante coerência com o valor persistido).
  useEffect(() => {
    if (ready && settings.theme) applyTheme(settings.theme);
  }, [ready, settings.theme]);

  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  const goalStr = settings.goalDate ? new Date(settings.goalDate).toISOString().slice(0, 10) : "";
  const theme: Theme = settings.theme ?? "dark";
  const notifSupported = notificationsSupported();

  async function doExport() {
    const json = await exportData();
    triggerDownload(json, `matemonstro-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    setMsg("Backup exportado.");
  }

  async function doImport(file: File) {
    try {
      const text = await file.text();
      await importData(text);
      setMsg("Dados importados com sucesso.");
    } catch {
      setMsg("Arquivo inválido.");
    }
  }

  function triggerDownload(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function chooseTheme(next: Theme) {
    applyTheme(next);
    updateSettings({ theme: next });
  }

  async function toggleNotifications() {
    if (!notifSupported) {
      setMsg("Este navegador não suporta notificações.");
      return;
    }
    if (settings.notifications) {
      await updateSettings({ notifications: false });
      setMsg("Lembretes de revisão desativados.");
      return;
    }
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") {
      await updateSettings({ notifications: true });
      setMsg("Lembretes ativados. Você receberá um aviso por dia quando houver revisões vencidas.");
    } else if (result === "denied") {
      setMsg("Permissão negada. Habilite as notificações do site nas configurações do navegador.");
    } else {
      setMsg("Permissão não concedida.");
    }
  }

  function exportAnki(trackId?: string) {
    const count = ankiCardCount(trackId);
    if (count === 0) {
      setMsg("Nada para exportar: nenhum flashcard nesta seleção.");
      return;
    }
    triggerDownload(toAnkiTsv({ trackId }), ankiFileName(trackId), "text/tab-separated-values;charset=utf-8");
    setMsg(`Exportados ${count} flashcards para Anki (.tsv).`);
  }

  return (
    <div className="space-y-6 max-w-xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Ajustes</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">O plano de hoje e as projeções se adaptam a isto.</p>
      </header>

      <section className="panel p-5 space-y-5">
        <div>
          <label className="block text-sm font-semibold mb-1">Minutos de estudo por dia</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={15}
              max={360}
              step={15}
              value={settings.minutesPerDay}
              onChange={(e) => updateSettings({ minutesPerDay: Number(e.target.value), onboarded: true })}
              className="flex-1 accent-[var(--color-brand)]"
              aria-label="Minutos de estudo por dia"
            />
            <span className="chip w-20 justify-center">{settings.minutesPerDay} min</span>
          </div>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            {(settings.minutesPerDay / 60).toFixed(1)}h/dia. Revisões espaçadas vêm primeiro; o resto vira estudo novo.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Dias de estudo por semana</label>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                onClick={() => updateSettings({ daysPerWeek: n, onboarded: true })}
                className={`btn !px-3 ${settings.daysPerWeek === n ? "btn-primary" : ""}`}
                aria-pressed={settings.daysPerWeek === n}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Meta (data alvo) — opcional</label>
          <input
            type="date"
            value={goalStr}
            onChange={(e) =>
              updateSettings({ goalDate: e.target.value ? new Date(e.target.value).getTime() : undefined, onboarded: true })
            }
            className="rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
          />
          <p className="text-xs text-[var(--color-mut)] mt-1">Ex.: data de um concurso de IF ou da prova de mestrado. O app avisa se você está no ritmo.</p>
        </div>
      </section>

      <section className="panel p-5 space-y-5">
        <div>
          <h2 className="font-bold">Ritmo de aprendizado</h2>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Como o motor de repetição espaçada agenda revisões e distribui o estudo. Os padrões são bons — mexa quando
            quiser mais durabilidade (reta final) ou menos carga (fase tranquila).
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Meta de retenção</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.8}
              max={0.97}
              step={0.01}
              value={settings.requestRetention ?? 0.9}
              onChange={(e) => updateSettings({ requestRetention: Number(e.target.value) })}
              className="flex-1 accent-[var(--color-brand)]"
              aria-label="Meta de retenção"
            />
            <span className="chip w-16 justify-center">{Math.round((settings.requestRetention ?? 0.9) * 100)}%</span>
          </div>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Quão bem você quer lembrar quando um cartão vence. Mais alto fixa mais forte, mas exige mais revisões; mais
            baixo alivia a fila e aceita esquecer um pouco mais. Afeta só os próximos agendamentos.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Trilhas em paralelo</label>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => updateSettings({ parallelTracks: n })}
                className={`btn !px-3 ${(settings.parallelTracks ?? 2) === n ? "btn-primary" : ""}`}
                aria-pressed={(settings.parallelTracks ?? 2) === n}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Quantos assuntos o plano do dia intercala ao mesmo tempo. Intercalar (2–3) fixa melhor que esgotar uma
            trilha antes de tocar a próxima.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Cartões novos por dia</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={40}
              step={5}
              value={settings.newCardsPerDay ?? 15}
              onChange={(e) => updateSettings({ newCardsPerDay: Number(e.target.value) })}
              className="flex-1 accent-[var(--color-brand)]"
              aria-label="Cartões novos por dia"
            />
            <span className="chip w-16 justify-center">{settings.newCardsPerDay ?? 15}</span>
          </div>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Teto de flashcards inéditos introduzidos por dia. Começar um subtópico não despeja tudo de uma vez — o
            excedente entra nos dias seguintes, evitando picos de revisão.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Teto de revisões por dia</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={20}
              max={300}
              step={10}
              value={settings.maxReviewsPerDay ?? 120}
              onChange={(e) => updateSettings({ maxReviewsPerDay: Number(e.target.value) })}
              className="flex-1 accent-[var(--color-brand)]"
              aria-label="Teto de revisões por dia"
            />
            <span className="chip w-16 justify-center">{settings.maxReviewsPerDay ?? 120}</span>
          </div>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Limite da fila de revisão de hoje. O que passar disso continua vencido e reaparece amanhã — a fila nunca
            vira uma montanha impagável.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold">Intercalar trilhas</div>
            <p className="text-xs text-[var(--color-mut)] mt-0.5">
              Alterna entre trilhas liberadas no plano do dia (recomendado) em vez de seguir uma fila linear.
            </p>
          </div>
          <button
            onClick={() => updateSettings({ interleave: !(settings.interleave ?? true) })}
            className={`btn shrink-0 ${(settings.interleave ?? true) ? "btn-primary" : ""}`}
            aria-pressed={settings.interleave ?? true}
          >
            {(settings.interleave ?? true) ? "Ativado" : "Desativado"}
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold">Prever antes de revelar</div>
            <p className="text-xs text-[var(--color-mut)] mt-0.5">
              Na revisão, você diz “vou lembrar / talvez / não” antes de ver o verso. Treina metacognição e mede sua
              calibração (quanto você superestima a própria memória).
            </p>
          </div>
          <button
            onClick={() => updateSettings({ calibration: !(settings.calibration ?? false) })}
            className={`btn shrink-0 ${(settings.calibration ?? false) ? "btn-primary" : ""}`}
            aria-pressed={settings.calibration ?? false}
          >
            {(settings.calibration ?? false) ? "Ativado" : "Desativado"}
          </button>
        </div>
      </section>

      <section className="panel p-5 space-y-4">
        <div>
          <h2 className="font-bold">Aparência</h2>
          <p className="text-xs text-[var(--color-mut)] mt-1">Tema visual do app. Muda na hora, sem recarregar.</p>
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Tema">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => chooseTheme(t.id)}
              className={`btn gap-2 ${theme === t.id ? "btn-primary" : ""}`}
              aria-pressed={theme === t.id}
            >
              <span aria-hidden="true">{t.glyph}</span>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-5 space-y-3">
        <div>
          <h2 className="font-bold">Lembretes de revisão</h2>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Notificação local (uma por dia) quando houver revisões vencidas ao abrir o app. Nada sai deste navegador.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={toggleNotifications}
            className={`btn ${settings.notifications ? "btn-primary" : ""}`}
            aria-pressed={settings.notifications}
            disabled={!notifSupported}
          >
            {settings.notifications ? "🔔 Ativado" : "🔕 Ativar lembretes"}
          </button>
          {!notifSupported && (
            <span className="text-xs text-[var(--color-mut)]">Não suportado neste navegador.</span>
          )}
          {notifSupported && perm === "denied" && (
            <span className="text-xs text-[var(--color-warn)]">
              Permissão bloqueada no navegador — libere nas configurações do site.
            </span>
          )}
        </div>
      </section>

      <section className="panel p-5 space-y-3">
        <div>
          <h2 className="font-bold">Exportar para o Anki</h2>
          <p className="text-xs text-[var(--color-mut)] mt-1">
            Gera um arquivo <code>.tsv</code> (frente / verso / tags) importável no Anki, preservando o LaTeX. As tags
            seguem <code>matemonstro::trilha::subtópico</code>.
          </p>
        </div>
        {!isReady ? (
          <p className="text-xs text-[var(--color-mut)]">Currículo ainda não gerado.</p>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap items-center">
              <button className="btn" onClick={() => exportAnki()}>
                ⬇ Currículo todo ({ankiCardCount()})
              </button>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={ankiTrack}
                onChange={(e) => setAnkiTrack(e.target.value)}
                className="rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)] max-w-[16rem]"
                aria-label="Trilha para exportar"
              >
                <option value="">Escolha uma trilha…</option>
                {allTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button className="btn" disabled={!ankiTrack} onClick={() => exportAnki(ankiTrack)}>
                ⬇ Exportar trilha{ankiTrack ? ` (${ankiCardCount(ankiTrack)})` : ""}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="font-bold">Backup dos dados</h2>
        <p className="text-xs text-[var(--color-mut)]">
          Seu progresso, anotações e revisões ficam só neste navegador (IndexedDB). Exporte de vez em quando para não perder.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className="btn" onClick={doExport}>⬇ Exportar JSON</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Importar JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
        </div>
      </section>

      <section className="panel p-5 border-[#5a2030]">
        <h2 className="font-bold text-[#ff8080]">Zona de perigo</h2>
        <p className="text-xs text-[var(--color-mut)] mt-1 mb-3">Apaga todo o progresso, anotações e revisões deste navegador.</p>
        <button
          className="btn !border-[#5a2030] !text-[#ff8080]"
          onClick={async () => {
            if (window.confirm("Apagar TODO o seu progresso? Isso não tem volta (exporte antes).")) {
              await wipe();
              setMsg("Tudo apagado.");
            }
          }}
        >
          Apagar tudo
        </button>
      </section>

      {msg && (
        <div className="chip" role="status" aria-live="polite">
          {msg}
        </div>
      )}
    </div>
  );
}
