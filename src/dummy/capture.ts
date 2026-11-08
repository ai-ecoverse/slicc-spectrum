import type {
  CaptureKind,
  CapturePort,
  CaptureStill,
  CaptureTake,
  LiveItem,
  Recording,
  SwitchesPort,
} from '../model/types.ts';
import type { Clock } from './clock.ts';
import type { DummyLive } from './live.ts';

export type CaptureScenario = 'on' | 'audio' | 'deny' | 'off';

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (char) => char.charCodeAt(0)
);

function denied(what: string): never {
  throw new DOMException(`${what} was denied`, 'NotAllowedError');
}

function switchKey(kind: CaptureKind | 'screen'): string {
  return kind === 'audio' ? 'microphone' : kind === 'video' ? 'camera' : 'screen';
}

function allowed(switches: SwitchesPort | undefined, kind: CaptureKind | 'screen'): boolean {
  const key = switchKey(kind);
  const found = switches?.list().find((item) => item.key === key);
  return !found || found.on;
}

export class DummyCapture implements CapturePort {
  kinds?: readonly CaptureKind[];
  still?: () => Promise<CaptureStill>;
  #live: DummyLive | undefined;
  #switches: SwitchesPort | undefined;
  #clock: Clock;
  #deny: boolean;
  #active = new Map<string, { stop(): void; cancel(): void }>();
  #prior: ((id: string) => void) | null = null;

  constructor(
    scenario: Exclude<CaptureScenario, 'off'>,
    clock: Clock,
    live?: DummyLive,
    switches?: SwitchesPort
  ) {
    this.#clock = clock;
    this.#live = live;
    this.#switches = switches;
    this.#deny = scenario === 'deny';
    this.kinds = scenario === 'audio' ? ['audio'] : ['audio', 'video'];
    this.still = () => this.#still();
    if (live) {
      this.#prior = live.act.bind(live);
      live.act = (id: string) => {
        const session = this.#active.get(id);
        if (session) session.stop();
        else this.#prior?.(id);
      };
    }
  }

  async record(kind: CaptureKind): Promise<Recording> {
    if (this.#deny || !allowed(this.#switches, kind))
      denied(kind === 'audio' ? 'Microphone access' : 'Camera access');
    if (this.kinds && !this.kinds.includes(kind))
      throw new DOMException(`Recording ${kind} isn’t supported here`, 'NotSupportedError');
    const id = `capture-${kind}`;
    if (this.#active.has(id)) throw new DOMException('Already recording', 'InvalidStateError');
    let settle!: (take: CaptureTake) => void;
    let fail!: (error: Error) => void;
    let done = false;
    const finished = new Promise<CaptureTake>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const mimeType = kind === 'audio' ? 'audio/webm' : 'video/webm';
    const name = 'recording.webm';
    const started = Date.now();
    const item: LiveItem = {
      id,
      kind: kind === 'audio' ? 'microphone' : 'camera',
      label: kind === 'audio' ? 'Recording microphone' : 'Recording camera',
      what: kind === 'audio' ? 'Desk microphone' : 'Face camera',
      asker: 'you',
      since: started,
      action: { label: 'Stop' },
    };
    const end = (take: CaptureTake | null, error?: Error) => {
      if (done) return;
      done = true;
      this.#active.delete(id);
      if (this.#live?.items().some((row) => row.id === id)) this.#prior?.(id);
      if (error) fail(error);
      else if (take) settle(take);
    };
    const session = {
      stop: () =>
        end({
          blob: new Blob([PNG], { type: mimeType }),
          mimeType,
          name,
          durationMs: Math.max(0, Date.now() - started),
        }),
      cancel: () => end(null, new DOMException('Recording cancelled', 'AbortError')),
    };
    this.#active.set(id, session);
    this.#live?.add(item);
    return { ...session, finished };
  }

  async #still(): Promise<CaptureStill> {
    if (this.#deny || !allowed(this.#switches, 'screen')) denied('Screen capture');
    await this.#clock.sleep();
    const id = 'capture-still';
    const item: LiveItem = {
      id,
      kind: 'screen',
      label: 'Taking a photo',
      what: 'This screen',
      asker: 'you',
      since: Date.now(),
      action: { label: 'Cancel' },
    };
    this.#live?.add(item);
    await this.#clock.sleep();
    if (this.#live?.items().some((row) => row.id === id)) this.#prior?.(id);
    return {
      blob: new Blob([PNG], { type: 'image/png' }),
      mimeType: 'image/png',
      name: 'screenshot.png',
    };
  }
}
