// ---- Curriculum content (gerado pelo workflow, lido de lib/curriculum-data.json) ----

export interface Book {
  title: string;
  author: string;
  note: string;
  chapters: string;
}

export interface FreeResource {
  title: string;
  kind: string;
  ref: string;
}

export interface ExamRelevance {
  ifConcurso: number; // 1-5
  mestrado: number; // 1-5
  note: string;
}

export interface KeyConcept {
  term: string;
  statement: string;
}

export interface Theorem {
  name: string;
  statement: string;
  whyItMatters: string;
}

export interface Exercise {
  prompt: string;
  hint: string;
  difficulty: number; // 1-5
  // Aditivos (specs 07/08) — todos opcionais.
  solution?: string;
  steps?: string[];
  source?: { exam: string; year?: number; institution?: string };
  tags?: string[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface SubResource {
  title: string;
  ref: string;
}

// ---- Aulas ricas (spec 07) ----
export interface Figure {
  kind: "plot2d" | "vectorfield" | "riemann" | "series" | "parametric";
  expr: string;
  domain?: [number, number];
  params?: { name: string; min: number; max: number; default: number; step?: number }[];
  caption?: string;
  // Curvas extras (mesma variavel de expr) desenhadas em traco fino sobreposto:
  // reta tangente, assintotas, somas parciais de Taylor, funcao de comparacao.
  overlay?: string[];
}

export interface StudyRoadmap {
  steps?: string[];
  searchQueries?: string[];
  videos?: { title: string; channel?: string; note?: string }[];
  articles?: { title: string; where?: string }[];
}

// ---- Banco de pratica / exames (spec 08) ----
export interface ExamQuestion {
  prompt: string;
  options?: string[];
  answer?: string;
  solution?: string;
  source?: { exam: string; year?: number; institution?: string };
  difficulty?: number;
}

export interface Subtopic {
  id: string;
  title: string;
  tagline?: string;
  objectives: string[];
  keyConcepts: KeyConcept[];
  theorems: Theorem[];
  summary: string;
  commonPitfalls: string[];
  worked?: string;
  exercises: Exercise[];
  flashcards: Flashcard[];
  estimatedHours: number;
  resources: SubResource[];
  // Aditivos (spec 07) — todos opcionais.
  history?: string;
  prereqs?: string[];
  figures?: Figure[];
  studyRoadmap?: StudyRoadmap;
}

export interface Track {
  id: string;
  title: string;
  phase: number; // 0,1,2
  phaseLabel: string;
  tagline?: string;
  summary: string;
  bigPicture: string;
  prereqs: string[];
  difficulty: number; // 1-5
  estimatedHours: number;
  primaryBooks: Book[];
  freeResources: FreeResource[];
  examRelevance: ExamRelevance;
  subtopics: Subtopic[];
  // Aditivos (specs 08/09) — todos opcionais.
  examBank?: ExamQuestion[];
  formulaSheet?: string;
  glossary?: { term: string; def: string }[];
}

export interface Milestone {
  after: string; // track id
  label: string;
  youCanNow: string;
}

export interface Phase {
  id: number;
  label: string;
  goal: string;
  trackIds: string[];
}

export interface CurriculumIndex {
  phases: Phase[];
  recommendedOrder: string[];
  prelimMap: { analise: string[]; algebra: string[]; topologiaGeometria: string[] };
  ifConcursoCore: string[];
  milestones: Milestone[];
  notes: string;
  totalHours: number;
}

export interface Curriculum {
  tracks: Track[];
  index: CurriculumIndex;
  generatedAt?: string;
}

// ---- Estado do usuario (persistido no IndexedDB) ----

export type SubStatus = "todo" | "doing" | "done";

export interface Progress {
  id: string; // subtopic id
  status: SubStatus;
  notes: string; // anotacoes livres (markdown)
  keyPoints: string; // "o principal" — resumo obrigatorio ao concluir
  startedAt?: number;
  completedAt?: number;
}

export interface Card {
  id: string; // `${subId}::${index}`
  subId: string;
  trackId: string;
  front: string;
  back: string;
  ease: number; // fator de facilidade (SM-2), default 2.5
  interval: number; // dias (pode ser fracionario)
  reps: number;
  lapses: number;
  due: number; // timestamp
  createdAt: number;
  // Aditivos FSRS-lite (spec 02) — todos opcionais, retrocompativeis com SM-2.
  stability?: number;
  difficulty?: number;
  state?: "new" | "learning" | "review" | "relearning";
  lastReview?: number;
  step?: number;
}

export interface Settings {
  minutesPerDay: number;
  daysPerWeek: number;
  startDate: number;
  goalDate?: number;
  notifications: boolean;
  onboarded: boolean;
  // ---- Campos v2 aditivos/opcionais (defaults em defaultSettings de lib/store.ts) ----
  requestRetention?: number; // spec 02
  interleave?: boolean; // spec 03
  parallelTracks?: number; // spec 03
  maxReviewsPerDay?: number; // spec 03
  newCardsPerDay?: number; // spec 03
  calibration?: boolean; // spec 06
  fsrsIntervalScale?: number; // spec quant: escala de intervalo calibrada (lib/fsrs-optimize.ts), opt-in
  // ---- Motivacao / meta minima (spec motivacao) ----
  dailyGoalTier?: "basico" | "casual" | "regular" | "serio" | "intenso"; // meta minima nomeada (piso que "conta")
  reviewGoalPerDay?: number; // alvo pequeno de revisoes/dia (anti-backlog assustador), default 10
  anchorText?: string; // habit-stacking: "depois do cafe" (gatilho do usuario)
  anchorTime?: string; // "HH:MM" do gatilho
  goal?: "base" | "if" | "mestrado"; // spec 11
  streakFreezes?: number; // spec 11
  lastStreakDay?: string; // spec 11 (YYYY-MM-DD)
  theme?: "dark" | "light" | "sepia"; // spec 12
}

export interface StudyLogEntry {
  day: string; // YYYY-MM-DD
  minutes: number;
  reviews: number;
}

// ---- Pratica / marcas / eventos de revisao (spec 01) ----
export interface ExerciseAttempt {
  id: string;
  exKey: string;
  subId: string;
  trackId: string;
  grade: "acertei" | "quase" | "errei";
  ts: number;
  due: number;
}

export interface ExerciseMark {
  key: string;
  kind: "exercise" | "favorite";
  status?: "acertei" | "errei" | "pendente";
  ts: number;
}

export interface ReviewEvent {
  id: string;
  cardId: string;
  subId: string;
  predicted?: "sim" | "talvez" | "nao";
  grade: string;
  ts: number;
}

// ---- Notas (estilo Obsidian) — specs 04/07/08 ----
export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  subtopicId?: string | null;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  // Aditivo (pastas, estilo Obsidian): caminho normalizado, ex. "Analise/Limites".
  // null/undefined = raiz do vault. Ver normalizeFolder em lib/notes.ts.
  folder?: string | null;
}
