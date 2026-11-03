export function displayCommand(command: string): string {
  return command.replace(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/gu, (char) => {
    const code = char.codePointAt(0) as number;
    if (code < 0x20) return String.fromCodePoint(0x2400 + code) + (code === 10 ? '\n' : '');
    if (code === 0x7f) return '\u2421';
    return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  });
}
