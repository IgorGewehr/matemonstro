"use client";

// Painel reutilizável de códigos de recuperação (pós-cadastro e regeneração
// em /conta): grid monoespaçado + copiar + baixar .txt.

import { useState } from "react";

export default function RecoveryCodesPanel({ codes, email }: { codes: string[]; email?: string }) {
  const [copied, setCopied] = useState(false);

  const asText = () =>
    [
      "Matemonstro — códigos de recuperação",
      email ? `Conta: ${email}` : "",
      `Gerados em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      "Cada código funciona UMA vez para redefinir sua senha.",
      "Guarde este arquivo num lugar seguro (gerenciador de senhas).",
      "",
      ...codes,
      "",
    ]
      .filter((l) => l !== null)
      .join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bloqueado: o download continua disponível
    }
  }

  function download() {
    const blob = new Blob([asText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "matemonstro-codigos-recuperacao.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 p-4 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)]">
        {codes.map((c) => (
          <code key={c} className="font-mono text-sm text-center tracking-wider text-[var(--color-txt)]">
            {c}
          </code>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" className="btn flex-1 text-sm" onClick={copy}>
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
        <button type="button" className="btn flex-1 text-sm" onClick={download}>
          ⬇ Baixar .txt
        </button>
      </div>
    </div>
  );
}
