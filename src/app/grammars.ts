export type GrammarKind = 'langs' | 'themes';

export const grammarCdn = 'https://cdn.jsdelivr.net/npm/@shikijs/';

let local: string | null = null;

export function setGrammarBase(base: string | null): void {
  local = base;
}

export function grammarBase(): string | null {
  return local;
}

export function grammarUrls(
  kind: GrammarKind,
  name: string,
  version: string,
  remote: string,
  base: string | null = local,
  page: string = globalThis.document?.baseURI ?? 'http://localhost/'
): string[] {
  const urls: string[] = [];
  if (base) urls.push(new URL(`${kind}/dist/${name}.mjs`, new URL(base, page)).href);
  urls.push(`${remote}${kind}@${version}/dist/${name}.mjs`);
  return urls;
}

export async function grammar(
  kind: GrammarKind,
  name: string,
  version: string,
  remote: string = grammarCdn,
  importer: (url: string) => Promise<unknown> = (url) => import(url)
): Promise<unknown> {
  let failure: unknown;
  for (const url of grammarUrls(kind, name, version, remote)) {
    try {
      return await importer(url);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}
