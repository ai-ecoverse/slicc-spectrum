const prefixes = [
  'sk-',
  'sk_',
  'rk_',
  'pk_live',
  'ghp_',
  'gho_',
  'ghu_',
  'ghs_',
  'ghr_',
  'github_pat_',
  'glpat-',
  'xoxa-',
  'xoxb-',
  'xoxp-',
  'xoxs-',
  'AKIA',
  'ASIA',
  'AIza',
  'npm_',
  'pypi-',
  'hf_',
  'eyJ',
  '-----BEGIN',
];

const keyed =
  /(?:[\w-]*(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth(?:orization)?)[\w-]*["']?\s*[:=]\s*|(?:^|\s)--?[\w-]*(?:token|secret|password|api-key|key)\s+|\bbearer\s+)/gi;

const word = /[^\s'"=:,;(){}[\]`]+/g;

export function guard(text: string, growing = false): string {
  let cut = text.length;
  for (const match of text.matchAll(keyed)) cut = Math.min(cut, match.index + match[0].length);
  for (const match of text.matchAll(word)) {
    const token = match[0];
    const last = growing && match.index + token.length === text.length;
    const risky = prefixes.some(
      (prefix) =>
        token.startsWith(prefix) || (last && token.length >= 2 && prefix.startsWith(token))
    );
    if (risky) cut = Math.min(cut, match.index);
  }
  return cut < text.length ? `${text.slice(0, cut).trimEnd()} …` : text;
}
