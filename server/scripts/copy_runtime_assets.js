// javascript-obfuscator emits JavaScript only. Copy required static assets
// explicitly so the dist-only Docker image includes them without bundling config.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function copyRuntimeAssets(root = process.cwd()) {
  for (const name of ['attendance-openapi.json', 'swagger-api-view.json', 'swagger-api-v2-view.json']) {
    const relativePath = path.join('views', name);
    const source = path.join(root, relativePath);
    // Validate before publishing a build that would crash during startup.
    const spec = JSON.parse(await readFile(source, 'utf8'));
    if (name.startsWith('swagger-api') && !Object.keys(spec.paths || {}).length) {
      throw new Error(`${name} has no API routes; refusing to package it.`);
    }
    const destination = path.join(root, 'dist', relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  copyRuntimeAssets().catch(error => {
    console.error('Failed to copy required runtime assets:', error.message);
    process.exitCode = 1;
  });
}
