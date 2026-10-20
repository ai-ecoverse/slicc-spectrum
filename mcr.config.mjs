import base from './node_modules/@ai-ecoverse/slicc-shared-web/mcr.config.mjs';

export default {
  ...base,
  all: { ...base.all, filter: (path) => /\.(m?js|ts)$/.test(path) },
};
