"use client";

/**
 * Link "pular para o conteúdo" — invisível até receber foco por teclado.
 * Aponta para <main id="conteudo" tabIndex={-1}>. Depende de .sr-only e
 * :focus-visible definidos em globals.css.
 */
export default function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-[var(--color-brand)] focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-lg"
    >
      Pular para o conteúdo
    </a>
  );
}
