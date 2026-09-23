import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(directory, entry.name)]
        : [],
  );
}

describe('Storage architecture boundaries', () => {
  it('keeps storage provider implementations and env reads out of Catalog business layers', () => {
    for (const directory of ['domain', 'application']) {
      for (const file of files(`src/modules/catalog/${directory}`)) {
        expect(readFileSync(file, 'utf8')).not.toMatch(
          /@aws-sdk|s3-object-storage|process\.env|cloudflare/i,
        );
      }
    }

    for (const file of files('src/modules/catalog/infrastructure')) {
      expect(readFileSync(file, 'utf8')).not.toContain('process.env.OBJECT_STORAGE');
    }
  });
});
