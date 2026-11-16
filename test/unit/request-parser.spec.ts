import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Production Nest request parser', () => {
  it.each(['normal', 'trailing', 'gzip-trailing'])(
    'keeps serving after %s compressed request bodies in an isolated process',
    (mode) => {
      const result = spawnSync(
        process.execPath,
        [
          '--require',
          'ts-node/register/transpile-only',
          '--require',
          'tsconfig-paths/register',
          resolve(__dirname, '../helpers/request-parser-probe.ts'),
          mode,
        ],
        {
          cwd: resolve(__dirname, '../..'),
          env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'error' },
          encoding: 'utf8',
          timeout: 15_000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(result.stdout).toContain(`request-parser-probe:passed:${mode}`);
    },
    20_000,
  );
});
