// javascript-obfuscator emits JavaScript only. Copy required static assets
// explicitly so the dist-only Docker image includes them without bundling config.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function copyRuntimeAssets(root = process.cwd()) {
  const relativePath = path.join('views', 'attendance-openapi.json');
  const source = path.join(root, relativePath);
  // Validate before publishing a build that would crash during router import.
  JSON.parse(await readFile(source, 'utf8'));
  const destination = path.join(root, 'dist', relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  copyRuntimeAssets().catch(error => {
    console.error('Failed to copy required runtime assets:', error.message);
    process.exitCode = 1;
  });
}
