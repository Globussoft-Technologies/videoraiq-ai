import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function copyWhatsAppAssets(root = process.cwd()) {
  const relative = path.join('core', 'v1', 'whatsappKeys', 'assets', 'default-approval.png');
  const source = path.join(root, relative);
  const bytes = await readFile(source);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Default WhatsApp approval sample is not a PNG');
  const destination = path.join(root, 'dist', relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  copyWhatsAppAssets().catch(error => { console.error(error.message); process.exitCode = 1; });
}
