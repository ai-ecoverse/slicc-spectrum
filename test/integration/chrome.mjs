import { env } from 'node:process';
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

if (import.meta.main) {
  const { url } = await serve({ ...options, port: Number(env.PORT ?? 8080) });
  console.log(`slicc-spectrum test page on ${url}`);
}
