import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('static site validator', () => {
  it('accepts the DOM-built static demo', () => {
    expect.hasAssertions();
    const output = execFileSync(process.execPath, ['scripts/demo/validate-static-site.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('Static demo validation passed.');
  });
});
