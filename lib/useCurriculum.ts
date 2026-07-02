"use client";

// Hook para componentes que dependem do currículo mas ficam FORA do gate de
// ready do AppState (ex.: /biblioteca, grafo de notas, palette): dispara o
// load (idempotente) e re-renderiza quando o conteúdo chega.

import { useEffect, useSyncExternalStore } from "react";
import { subscribeCurriculum, curriculumSnapshot, loadCurriculum } from "./curriculum";

export function useCurriculumReady(): boolean {
  const ready = useSyncExternalStore(subscribeCurriculum, curriculumSnapshot, () => false);
  useEffect(() => {
    void loadCurriculum();
  }, []);
  return ready;
}
