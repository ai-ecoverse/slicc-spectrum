import { html, type TemplateResult } from 'lit';

const controls = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/u;
const notation = (char: string) =>
  `U+${(char.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')}`;
const names: Record<string, [string, string]> = {
  '\r': ['carriage return', 'CR'],
  '\n': ['line feed', 'LF'],
  '\t': ['tab', 'TAB'],
  '\x7f': ['delete', 'DEL'],
};

export function displayCommand(command: string): string {
  return command.replace(new RegExp(controls.source, 'gu'), (char) => {
    const code = char.codePointAt(0) as number;
    if (code < 0x20) return String.fromCodePoint(0x2400 + code) + (code === 10 ? '\n' : '');
    if (code === 0x7f) return '\u2421';
    return notation(char);
  });
}

export function commandText(command: string, multiline = true): Array<string | TemplateResult> {
  return command.split(new RegExp(`(${controls.source})`, 'gu')).map((part) => {
    if (!controls.test(part)) return part;
    const code = notation(part);
    const [name, short] = names[part] ?? [code, ''];
    const label = short ? `${name} (${code})` : code;
    const extra = (part.codePointAt(0) as number) < 0x20 ? short || code : short;
    return html`<span class="control" role="img" aria-label=${label} title=${label} data-label=${extra}>${displayCommand(part).trimEnd()}</span>${part === '\n' && multiline ? '\n' : ''}`;
  });
}
