import { css, html, type TemplateResult } from 'lit';

export const controlStyles = css`
  .control {
    display: inline-flex;
    align-items: baseline;
    gap: var(--swc-spacing-50);
    padding-inline: var(--swc-spacing-50);
    border-radius: var(--swc-corner-radius-75);
    background: var(--swc-gray-300);
    color: var(--swc-gray-900);
    font-size: var(--swc-font-size-100);
    font-weight: var(--swc-bold-font-weight);
  }
  .control[data-label]:not([data-label=''])::after {
    content: attr(data-label);
  }
`;

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
