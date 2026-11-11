import { LitElement } from 'lit';
import type { SliccModel } from '../model/types.ts';
import { askStep, StepWatch, stepLabel } from './step-labels.ts';

export class SliccStepLabel extends LitElement {
  static properties = {
    callId: { attribute: false },
    fallback: { attribute: false },
    agent: { attribute: false },
    model: { attribute: false },
    ask: { attribute: false },
  };
  declare callId: string;
  declare fallback: string;
  declare agent: string;
  declare model: SliccModel | null;
  declare ask: boolean;
  #watch = new StepWatch(() => this.requestUpdate());

  constructor() {
    super();
    this.callId = '';
    this.fallback = '';
    this.agent = '';
    this.model = null;
    this.ask = false;
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#watch.stop();
  }

  get text(): string {
    return (this.callId && stepLabel(this.model?.agent, this.agent, this.callId)) || this.fallback;
  }

  protected willUpdate(): void {
    const port = this.model?.agent;
    if (this.isConnected) this.#watch.watch(port, this.agent, this.callId);
    if (this.ask && this.callId) askStep(port, this.agent, this.callId);
  }

  render(): string {
    return this.text;
  }
}
