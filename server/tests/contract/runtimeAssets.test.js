import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { copyRuntimeAssets } from '../../scripts/copy_runtime_assets.js';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(spec) {
  const root = await mkdtemp(path.join(tmpdir(), 'attendance-assets-'));
  roots.push(root);
  await mkdir(path.join(root, 'views'));
  if (spec !== undefined) await writeFile(path.join(root, 'views', 'attendance-openapi.json'), spec);
  return root;
}

describe('production runtime assets', () => {
  it('packages the actual attendance spec unchanged alongside the built router', async () => {
    const source = await readFile(new URL('../../views/attendance-openapi.json', import.meta.url), 'utf8');
    const root = await fixture(source);
    await copyRuntimeAssets(root);
    expect(await readFile(path.join(root, 'dist/views/attendance-openapi.json'), 'utf8')).toBe(source);
    const scripts = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).scripts;
    expect(scripts.obfuscate).toMatch(/javascript-obfuscator .* && npm run build:assets$/);
    expect(scripts['build:assets']).toBe('node ./scripts/copy_runtime_assets.js');
    const dockerfile = await readFile(new URL('../../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile.indexOf("readFileSync('/app/views/attendance-openapi.json'")).toBeGreaterThan(dockerfile.indexOf('COPY dist/ /app/'));
  });

  it('fails the build when the required source spec is missing', async () => {
    await expect(copyRuntimeAssets(await fixture())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails the build for invalid JSON instead of shipping an unusable spec', async () => {
    await expect(copyRuntimeAssets(await fixture('{invalid'))).rejects.toBeInstanceOf(SyntaxError);
  });
});
