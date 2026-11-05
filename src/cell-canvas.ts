import { Renderer } from '@wterm/dom';

export function installCellCanvasHold(
  target: {
    prototype: {
      setCanvasSuspended: (suspended: boolean) => void;
      setup: (cols: number, rows: number) => void;
    };
  } = Renderer
): void {
  const set = target.prototype.setCanvasSuspended;
  target.prototype.setCanvasSuspended = function (this: unknown) {
    set.call(this, true);
  };
  const setup = target.prototype.setup;
  target.prototype.setup = function (this: unknown, cols: number, rows: number) {
    setup.call(this, cols, rows);
    set.call(this, true);
  };
}

installCellCanvasHold();
