import { LitElement } from 'lit';
import type { AgentPort, SliccModel, ToolCall } from '../model/types.ts';
import { askStep, hearSteps, stepLabel } from './step-labels.ts';
import { headline } from './tool-title.ts';

export class SliccStepLabel extends LitElement {
  static properties = {
    call: { attribute: false },
    agent: { attribute: false },
    model: { attribute: false },
    ask: { attribute: false },
  };
  declare call: ToolCall | null;
  declare agent: string;
  declare model: SliccModel | null;
  declare ask: boolean;
  #port: AgentPort | undefined;
  #off: () => void = () => undefined;

  constructor() {
    super();
    this.call = null;
    this.agent = '';
    this.model = null;
    this.ask = false;
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#listen(this.model?.agent);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#listen(undefined);
  }

  #listen(port: AgentPort | undefined): void {
    if (port === this.#port) return;
    this.#off();
    this.#port = port;
    this.#off = hearSteps(port, () => this.requestUpdate());
  }

  get text(): string {
    if (!this.call) return '';
    return stepLabel(this.model?.agent, this.agent, this.call.id) || headline(this.call);
  }

  protected willUpdate(): void {
    if (this.isConnected) this.#listen(this.model?.agent);
    if (this.ask && this.call) askStep(this.model?.agent, this.agent, this.call.id);
  }

  render(): string {
    return this.text;
  }
}
