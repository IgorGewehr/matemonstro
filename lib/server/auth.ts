import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/**
 * Gera o hash da senha usando scrypt nativo do Node (sem libs externas).
 * Formato armazenado: "scrypt$<saltHex>$<hashHex>".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Verifica se a senha em texto puro corresponde ao hash armazenado.
 * Comparacao em tempo constante via timingSafeEqual.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const storedHash = Buffer.from(hashHex, "hex");
  const derivedKey = (await scrypt(password, salt, storedHash.length)) as Buffer;
  if (derivedKey.length !== storedHash.length) return false;
  return timingSafeEqual(derivedKey, storedHash);
}

/** Validacao simples de email (o suficiente para signup). */
export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Senha minima de 8 caracteres, conforme o CONTRATO. */
export function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8;
}

// ---- Forca de senha (server-side; a UI tem um medidor equivalente) ----

// Senhas mais comuns (PT-BR + globais). Comparacao em minusculas.
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "senha123",
  "12341234", "11111111", "00000000", "87654321", "qwertyuiop", "qwerty123",
  "abc12345", "1q2w3e4r", "1q2w3e4r5t", "asdfghjk", "asdfghjkl", "iloveyou",
  "welcome1", "admin123", "letmein1", "brasil123", "flamengo1", "corinthians",
  "senhasenha", "matematica", "12345678a", "a12345678", "abcd1234", "aaaaaaaa",
  "sunshine1", "princess1", "football1", "monkey123", "dragon123", "master123",
  "computador", "internet1", "mudar123", "trocar123", "12qwaszx", "zaq12wsx",
]);

/**
 * Regras alem do minimo: nao ser senha comum, nao ser o proprio e-mail e ter
 * alguma variedade (nao um caractere unico repetido). Retorna null se ok, ou
 * a mensagem de erro.
 */
export function passwordStrengthError(password: string, email?: string): string | null {
  const p = password.toLowerCase();
  if (COMMON_PASSWORDS.has(p)) return "Essa senha esta entre as mais usadas do mundo — escolha outra.";
  if (/^(.)\1+$/.test(password)) return "A senha nao pode ser um caractere repetido.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && p.includes(local)) {
    return "A senha nao pode conter o seu e-mail.";
  }
  return null;
}

// ---- Codigos de recuperacao (reset de senha sem depender de e-mail) ----

export const RECOVERY_CODE_COUNT = 8;
// Alfabeto sem ambiguos (0/O, 1/I/L): 8 chars ~= 41 bits por codigo.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Gera os codigos em texto puro (mostrados UMA vez) + hashes para armazenar. */
export async function generateRecoveryCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, randomCode);
  const hashes = await Promise.all(plain.map((c) => hashPassword(normalizeRecoveryCode(c))));
  return { plain, hashes };
}

/**
 * Verifica um codigo contra a lista de hashes; devolve o indice consumivel ou
 * -1. Sempre percorre a lista inteira (nao vaza posicao por timing).
 */
export async function verifyRecoveryCode(code: string, hashes: string[]): Promise<number> {
  const norm = normalizeRecoveryCode(code);
  let found = -1;
  for (let i = 0; i < hashes.length; i++) {
    const ok = await verifyPassword(norm, hashes[i]);
    if (ok && found === -1) found = i;
  }
  return found;
}
