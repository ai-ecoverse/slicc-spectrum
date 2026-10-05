const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const prompt = '\x1b[1;32mfake\x1b[0m:\x1b[1;34m~\x1b[0m$ ';

export class FakeBackend {
  constructor({ echo = false, signals = true } = {}) {
    this.echo = echo;
    this.signalling = signals;
    this.bytes = [];
    this.sizes = [];
    this.signals = [];
    this.opened = 0;
    this.closed = 0;
    this.sink = null;
  }

  open(sink, size) {
    this.sink = sink;
    this.opened += 1;
    this.sizes.push(size);
    sink.output(encoder.encode(prompt));
    const session = {
      write: (data) => this.receive(data),
      resize: (cols, rows) => this.sizes.push({ cols, rows }),
      close: () => {
        this.closed += 1;
      },
    };
    if (this.signalling) session.signal = (name) => this.signals.push(name);
    return session;
  }

  receive(data) {
    this.bytes.push(...data);
    if (!this.echo) return;
    const text = decoder.decode(data);
    this.emit(text === '\r' ? `\r\n${prompt}` : text === '\x7f' ? '\b \b' : text);
  }

  emit(text) {
    this.sink.output(encoder.encode(text));
  }

  exit(status) {
    this.sink.exit(status);
  }

  text() {
    return decoder.decode(Uint8Array.from(this.bytes));
  }
}

export class DeferredBackend extends FakeBackend {
  constructor(options) {
    super(options);
    this.pending = [];
  }

  open(sink, size) {
    const call = Promise.withResolvers();
    this.pending.push({ sink, size, ...call });
    return call.promise.then(() => super.open(sink, size));
  }

  settle(index = 0) {
    this.pending[index].resolve();
  }

  fail(index, message) {
    this.pending[index].reject(new Error(message));
  }
}
