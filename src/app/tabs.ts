import type { TabSkew, TabsState } from '../model/types.ts';

export interface TabsLight {
  variant: 'neutral' | 'info' | 'notice';
  text: string;
  tooltip: string;
}

export interface TabsBanner {
  kind: 'skew' | 'stalled';
  skew: TabSkew | null;
  text: string;
  reload: boolean;
}

export const following =
  'SLICC runs in another tab. This tab shows it and sends your actions there.';
export const connecting = 'Connecting to the tab running SLICC…';
export const alone = 'SLICC is open in another tab.';

export function tabsBanner(state: TabsState | undefined): TabsBanner | null {
  if (!state || state.role === 'alone') return null;
  if (state.skew === 'newer')
    return {
      kind: 'skew',
      skew: 'newer',
      text: 'Another tab runs a newer SLICC. Reload this tab.',
      reload: true,
    };
  if (state.skew === 'older')
    return {
      kind: 'skew',
      skew: 'older',
      text: 'Another tab runs an older SLICC. Reload the other SLICC tab.',
      reload: false,
    };
  if (state.stalled)
    return {
      kind: 'stalled',
      skew: null,
      text: 'Chrome paused the tab running SLICC. Switch to it to continue.',
      reload: false,
    };
  return null;
}

export function tabsLight(state: TabsState | undefined): TabsLight | null {
  if (!state || state.role === 'owner' || state.role === 'alone') return null;
  const banner = tabsBanner(state);
  if (banner) return { variant: 'notice', text: 'Another tab', tooltip: banner.text };
  if (state.role === 'connecting')
    return { variant: 'info', text: 'Connecting', tooltip: connecting };
  return { variant: 'neutral', text: 'Another tab', tooltip: following };
}
