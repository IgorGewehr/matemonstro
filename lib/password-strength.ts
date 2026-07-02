// Medidor de força de senha da UI (heurística leve, espelha as regras do
// servidor em lib/server/auth.ts — a decisão final é sempre do servidor).

export interface PasswordStrength {
  /** 0 = inaceitável · 1 = fraca · 2 = ok · 3 = forte */
  score: 0 | 1 | 2 | 3;
  label: string;
  color: string;
  /** dica acionável quando score < 2 */
  hint?: string;
}

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "senha123",
  "12341234", "11111111", "00000000", "87654321", "qwertyuiop", "qwerty123",
  "abc12345", "1q2w3e4r", "1q2w3e4r5t", "asdfghjk", "asdfghjkl", "iloveyou",
  "welcome1", "admin123", "letmein1", "brasil123", "abcd1234", "aaaaaaaa",
]);

export function passwordStrength(password: string, email?: string): PasswordStrength {
  if (password.length < 8) {
    return { score: 0, label: "muito curta", color: "#ff6b6b", hint: "Use pelo menos 8 caracteres." };
  }
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    return { score: 0, label: "muito comum", color: "#ff6b6b", hint: "Essa senha é fácil de adivinhar — troque." };
  }
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
    return { score: 0, label: "contém seu e-mail", color: "#ff6b6b", hint: "Não use seu e-mail na senha." };
  }

  let variety = 0;
  if (/[a-z]/.test(password)) variety++;
  if (/[A-Z]/.test(password)) variety++;
  if (/[0-9]/.test(password)) variety++;
  if (/[^a-zA-Z0-9]/.test(password)) variety++;

  // comprimento pesa mais que "regrinhas": frase longa > senha curta rebuscada
  const points = (password.length >= 16 ? 3 : password.length >= 12 ? 2 : 1) + (variety >= 3 ? 1 : 0);

  if (points >= 4) return { score: 3, label: "forte", color: "#00d3a7" };
  if (points >= 2) return { score: 2, label: "ok", color: "#f6c453", hint: "Mais longa = mais forte. Tente 12+ caracteres." };
  return { score: 1, label: "fraca", color: "#ffb347", hint: "Alongue a senha ou misture tipos de caractere." };
}
