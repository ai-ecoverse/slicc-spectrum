import type { CellData } from '@wterm/core';
import { GhosttyCore } from '@wterm/ghostty';

const base = 0x51cc00;
const replies = /\x1b\]1[01];rgb:[0-9a-f/]+(?:\x07|\x1b\\)/gi;

const slot = (rgb: number | undefined) =>
  rgb !== undefined && rgb >>> 4 === base >>> 4 ? rgb & 15 : undefined;

function indexed(cell: CellData): CellData {
  const fg = slot(cell.fgRgb);
  const bg = slot(cell.bgRgb);
  if (fg !== undefined) {
    cell.fg = fg;
    delete cell.fgRgb;
  }
  if (bg !== undefined) {
    cell.bg = bg;
    delete cell.bgRgb;
  }
  return cell;
}

export async function loadCore(wasmPath: string): Promise<GhosttyCore> {
  const core = await GhosttyCore.load({ wasmPath, scrollbackLimit: 4_000_000 });
  core.setThemeColors({
    foreground: 0xd4d4d4,
    background: 0x1d1d1d,
    cursor: 0xaeafad,
    palette: Array.from({ length: 16 }, (_, index) => base + index),
  });
  const cell = core.getCell.bind(core);
  const history = core.getScrollbackCell.bind(core);
  const response = core.getResponse.bind(core);
  core.getCell = (row, col) => indexed(cell(row, col));
  core.getScrollbackCell = (offset, col) => indexed(history(offset, col));
  core.getResponse = () => {
    for (let reply = response(); reply !== null; reply = response()) {
      const kept = reply.replace(replies, '');
      if (kept) return kept;
    }
    return null;
  };
  return core;
}
