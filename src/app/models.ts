import type { ModelOption, SliccModel } from '../model/types.ts';
import { chatModels } from './base.ts';
import { watchOnly } from './follow.ts';

export interface ModelSwitch {
  to: ModelOption;
}

const asked = new WeakMap<SliccModel, Map<string, string>>();
const switched = new WeakMap<SliccModel, ModelSwitch>();

function stale(model: SliccModel, id: string, offered: readonly ModelOption[]): boolean {
  if (offered.some((option) => option.id === id)) return false;
  const provider = id.split('/')[0];
  return !model.settings
    .accounts()
    .some((account) => account.id === provider && account.status === 'connected');
}

export function fallbackModel(options: readonly ModelOption[]): ModelOption | undefined {
  const offered = chatModels(options);
  return offered.find((option) => option.default) ?? offered[0];
}

export function settleModels(model: SliccModel): void {
  if (watchOnly(model)) return;
  const offered = chatModels(model.settings.models());
  const pick = fallbackModel(offered);
  if (!pick) return;
  const requests = asked.get(model) ?? new Map<string, string>();
  asked.set(model, requests);
  const ask = (key: string, from: string, apply: () => void): void => {
    if (!stale(model, from, offered)) {
      requests.delete(key);
      return;
    }
    if (requests.get(key) === pick.id) return;
    requests.set(key, pick.id);
    switched.set(model, { to: pick });
    apply();
  };
  for (const agent of model.agent.list())
    if (!agent.frozen)
      ask(`agent:${agent.id}`, agent.model, () => model.agent.setModel(agent.id, pick.id));
  ask('settings', model.settings.get().model, () => model.settings.update({ model: pick.id }));
}

export function modelSwitch(model: SliccModel): ModelSwitch | undefined {
  return switched.get(model);
}

export function forgetSwitch(model: SliccModel): void {
  switched.delete(model);
}
