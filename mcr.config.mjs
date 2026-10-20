import { fileURLToPath } from 'node:url';
import base from './node_modules/@ai-ecoverse/slicc-shared-web/mcr.config.mjs';

const setup = `--import="${fileURLToPath(new URL('./unit-setup.mjs', import.meta.url))}"`;
const options = process.env.NODE_OPTIONS ?? '';
if (!options.includes(setup)) process.env.NODE_OPTIONS = options ? `${options} ${setup}` : setup;

export default {
  ...base,
  all: { ...base.all, filter: (path) => /\.(m?js|ts)$/.test(path) },
};
