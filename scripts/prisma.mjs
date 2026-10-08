import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const cli = join(
  dirname(
    createRequire(new URL('../apps/api/package.json', import.meta.url)).resolve(
      'prisma/package.json',
    ),
  ),
  'build/index.js',
);
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: fileURLToPath(new URL('../apps/api', import.meta.url)),
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
