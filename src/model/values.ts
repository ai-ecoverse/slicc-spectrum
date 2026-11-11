import type { ErrorCode, VaultFailure } from './types.ts';

export function mimeOf(name: string): string {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.gif$/i.test(name)) return 'image/gif';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.svg$/i.test(name)) return 'image/svg+xml';
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.(md|txt|csv|ya?ml|toml|ts|js|css|html)$/i.test(name)) return 'text/plain';
  return 'application/octet-stream';
}

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

export function vaultFailure(
  code: ErrorCode,
  message: string,
  cause?: VaultFailure['cause']
): VaultFailure {
  return Object.assign(new Error(message), { code }, cause ? { cause } : {}) as VaultFailure;
}

export function isVaultFailure(error: unknown): error is VaultFailure {
  return error instanceof Error && typeof (error as Partial<VaultFailure>).code === 'string';
}

export function isPolicyPaused(error: unknown): boolean {
  return isVaultFailure(error) && error.cause === 'policy-paused';
}
