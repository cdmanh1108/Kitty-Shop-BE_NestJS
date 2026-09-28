import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const entrypoint = 'dist/src/main.js';
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
const dockerfile = readFileSync(resolve(repositoryRoot, 'Dockerfile'), 'utf8');

if (packageJson.scripts['start:prod'] !== `node ${entrypoint}`) {
  throw new Error(`start:prod must execute ${entrypoint}.`);
}
if (!dockerfile.includes(`CMD ["node", "${entrypoint}"]`)) {
  throw new Error(`Dockerfile must execute ${entrypoint}.`);
}
if (!existsSync(resolve(repositoryRoot, entrypoint))) {
  throw new Error(`Production build did not create ${entrypoint}.`);
}

console.log(`Verified canonical production entrypoint: ${entrypoint}`);
