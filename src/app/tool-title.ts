import type { ToolCall } from '../model/types.ts';
import { guard } from './guard.ts';

const shellLead =
  /^(?:(?:git|npm|npx|pnpm|yarn|bun|node|deno|python3?|pip3?|curl|wget|ls|cd|cat|rm|mv|cp|chmod|chown|mkdir|touch|tar|zip|unzip|docker|kubectl|gh|wrangler|lsof|find|grep|rg|sed|awk|ssh|scp|rsync|make|cargo|go|ruby|perl|php|java|javac|swift|xcodebuild|brew|apt|yum|sudo|env|export|echo|printf|true|false|test|bash|sh|zsh|fish|source)(?=\s|$)|(?:\.\/))/;

export function rawTitle(title: string): boolean {
  const text = title.trim();
  if (!text) return false;
  if (text.length > 80) return true;
  if (/[|;&><`]|\$\(|&&|\|\|/.test(text)) return true;
  if (/^-[A-Za-z0-9]/.test(text)) return true;
  if (/^[a-z]/.test(text) && shellLead.test(text)) return true;
  if (!/\s/.test(text) && (/^[./~]/.test(text) || /\.[A-Za-z0-9]+$/.test(text))) return true;
  return false;
}

export function headline(call: ToolCall): string {
  const title = call.title.trim();
  const name = call.name.trim();
  const growing = call.status === 'running';
  if (!title) return guard(name, growing);
  if (rawTitle(title)) return guard(`${name} ${title}`.trim(), growing);
  return guard(title, growing);
}
