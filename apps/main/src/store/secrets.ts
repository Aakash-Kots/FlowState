/**
 * Secret storage backed by the OS Keychain via Electron's `safeStorage`. Only
 * the encrypted ciphertext touches the SQLite database — plaintext is never
 * written. If encryption is unavailable (e.g. a headless Linux CI box), we
 * refuse to persist rather than silently storing plaintext.
 *
 * Any third-party credential FlowState holds — Linear, GitHub, an optional
 * Anthropic key — belongs here, keyed by a well-known name.
 */
import { safeStorage } from 'electron';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { secrets } from './schema';

/** Well-known secret names FlowState persists. */
export const SecretName = {
  LinearToken: 'linear.token',
  GithubToken: 'github.token',
  AnthropicApiKey: 'anthropic.apiKey',
} as const;
export type SecretName = (typeof SecretName)[keyof typeof SecretName];

export function setSecret(name: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      `[store] safeStorage unavailable — refusing to persist secret "${name}" in plaintext.`,
    );
    return;
  }
  const ciphertext = safeStorage.encryptString(value);
  getDb()
    .insert(secrets)
    .values({ name, ciphertext })
    .onConflictDoUpdate({ target: secrets.name, set: { ciphertext } })
    .run();
}

export function getSecret(name: string): string | null {
  const row = getDb().select().from(secrets).where(eq(secrets.name, name)).get();
  if (!row) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(`[store] safeStorage unavailable — cannot decrypt secret "${name}".`);
    return null;
  }
  return safeStorage.decryptString(row.ciphertext);
}

export function deleteSecret(name: string): void {
  getDb().delete(secrets).where(eq(secrets.name, name)).run();
}
