import type { ErrorCode, VaultFailure } from './types.ts';

export function valueProblem(value: string): string | null {
  if (new TextEncoder().encode(value).length < 8)
    return "Values shorter than 8 bytes can't be protected from the model";
  if (/[\r\n\0]/.test(value)) return "Values can't contain line breaks or NUL characters";
  if (value.includes('fnox_proxy_'))
    return "That's a placeholder, not a value. Paste the real value";
  return null;
}

export function nameProblem(name: string): string | null {
  return /^[A-Z_][A-Z0-9_]*$/.test(name)
    ? null
    : "Names use A to Z, 0 to 9 and _, and don't start with a digit";
}

export function vaultFailure(code: ErrorCode, message: string): VaultFailure {
  return Object.assign(new Error(message), { code });
}

export function isVaultFailure(error: unknown): error is VaultFailure {
  return error instanceof Error && typeof (error as Partial<VaultFailure>).code === 'string';
}
