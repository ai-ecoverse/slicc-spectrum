import { argv, env } from 'node:process';
import { fileURLToPath } from 'node:url';
import { serve, launch as start } from '@ai-ecoverse/slicc-shared-web/harness';

const options = {
  roots: [
    ['/dist/', 'dist/'],
    ['/node_modules/', 'node_modules/'],
    ['/', 'test/integration/page/'],
  ],
  isolated: true,
  coverage: ['/dist/'],
};

export const launch = () => start(options);

if (argv[1] === fileURLToPath(import.meta.url)) {
  const { url, overrides } = await serve({ ...options, port: Number(env.PORT ?? 8080) });
  for (const weight of ['Regular', 'Medium', 'Bold', 'ExtraBold']) {
    const name = `AdobeClean-${weight}.otf`;
    const response = await fetch(`https://seven.sliccy.ai/fonts/${name}`).catch(() => null);
    if (response?.ok) overrides.set(`/fonts/${name}`, Buffer.from(await response.arrayBuffer()));
  }
  console.log(`slicc-spectrum test page on ${url}`);
}
