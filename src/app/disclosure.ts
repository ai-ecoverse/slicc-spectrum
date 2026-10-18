import '@adobe/spectrum-wc-icons/swc-icon-chevron-right.js';
import { css, html } from 'lit';

export const chevron = html`<swc-icon-chevron-right class="chevron" size="s" aria-hidden="true"></swc-icon-chevron-right>`;

export const smallChevron = html`<swc-icon-chevron-right class="chevron" size="xs" aria-hidden="true"></swc-icon-chevron-right>`;

export const disclosureStyles = css`
  details > summary {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-75);
    width: fit-content;
    list-style: none;
    cursor: pointer;
    color: var(--swc-neutral-subdued-content-color-default);
    border-radius: var(--swc-corner-radius-small-default);
  }
  details > summary::-webkit-details-marker {
    display: none;
  }
  details > summary:hover {
    color: var(--swc-neutral-subdued-content-color-hover);
  }
  details > summary:focus-visible {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: var(--swc-focus-ring-gap);
  }
  details > summary > .chevron {
    flex: none;
    color: inherit;
    transition: transform var(--swc-animation-duration-100);
  }
  details[open] > summary > .chevron {
    transform: rotate(90deg);
  }
  :host(:dir(rtl)) details:not([open]) > summary > .chevron {
    transform: scaleX(-1);
  }
  @media (prefers-reduced-motion: reduce) {
    details > summary > .chevron {
      transition: none;
    }
  }
`;
