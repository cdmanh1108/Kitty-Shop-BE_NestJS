import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import * as ts from 'typescript';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(directory, entry.name)]
        : [],
  );
}

describe('Storage and legacy infrastructure boundaries', () => {
  it('keeps XLSX and CLI modules out of the HTTP runtime import graph', () => {
    const visited = new Set<string>();
    const visit = (file: string): void => {
      if (visited.has(file)) return;
      visited.add(file);
      expect(file).not.toContain(`${sep}cli${sep}`);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of source.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier) ||
          node.importClause?.isTypeOnly
        )
          continue;
        const specifier = node.moduleSpecifier.text;
        expect(specifier).not.toBe('xlsx');
        const base = specifier.startsWith('.')
          ? resolve(dirname(file), specifier)
          : specifier.startsWith('@') && specifier.includes('/')
            ? resolve('src', specifier.replace(/^@\/?/, ''))
            : null;
        if (!base) continue;
        const target = [`${base}.ts`, join(base, 'index.ts')].find(existsSync);
        if (target) visit(target);
      }
    };
    visit(resolve('src/app.module.ts'));
  });
  it('keeps storage provider implementations and env reads out of Catalog business layers', () => {
    for (const directory of ['domain', 'application']) {
      for (const file of files(`src/modules/catalog/${directory}`)) {
        expect(readFileSync(file, 'utf8')).not.toMatch(
          /@aws-sdk|s3-object-storage|process\.env|cloudflare/i,
        );
      }
    }
    for (const file of files('src/modules/catalog/infrastructure'))
      expect(readFileSync(file, 'utf8')).not.toContain('process.env.OBJECT_STORAGE');
    expect(readFileSync('src/modules/catalog/catalog.module.ts', 'utf8')).not.toContain(
      'LegacyCatalogImportService',
    );
  });
});
