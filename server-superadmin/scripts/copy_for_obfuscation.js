// scripts/copy_for_obfuscation.js
// Copies the repository into obf_src/ excluding node_modules and a few other folders.
// Cross-platform: uses Node fs only.

import fs from "fs/promises";
import path from "path";

const SRC = process.cwd();
const OUT = path.join(process.cwd(), "obf_src");

// Exclusions: will NOT copy these directories/files
const EXCLUDES = new Set([
  "node_modules",
  ".git",
  "obf_src", // avoid recursion if re-run
  "dist",
  "obfuscated",
  ".env",
  ".DS_Store",
  "config",
  "encrypt.js",
  "copy_for_obfuscation.js",
  "logs",
  ".vscode",
  "Dockerfile",
  "docker-compose.yml",
  "deploy.js"
]);

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyFileOrDir(srcPath, destPath) {
  const stat = await fs.lstat(srcPath);
  if (stat.isSymbolicLink()) {
    // skip symlinks to avoid surprises
    return;
  } else if (stat.isDirectory()) {
    await fs.mkdir(destPath, { recursive: true });
    const entries = await fs.readdir(srcPath);
    for (const name of entries) {
      if (EXCLUDES.has(name)) continue;
      const childSrc = path.join(srcPath, name);
      const childDest = path.join(destPath, name);
      await copyFileOrDir(childSrc, childDest);
    }
  } else if (stat.isFile()) {
    // ensure dest dir exists
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
  }
}

async function rimrafDir(dir) {
  if (!(await exists(dir))) return;
  // Node 14+ supports rm with recursive
  await fs.rm(dir, { recursive: true, force: true });
}

async function main() {
  console.log(
    "Preparing obfuscation source in ./obf_src (excluding node_modules and other folders)..."
  );
  await rimrafDir(OUT);
  await fs.mkdir(OUT, { recursive: true });

  const entries = await fs.readdir(SRC);
  for (const name of entries) {
    if (EXCLUDES.has(name)) {
      // console.log('skipping', name);
      continue;
    }
    // don't copy the scripts folder if you want it obfuscated too; currently we will copy it so it gets obfuscated as well
    const srcPath = path.join(SRC, name);
    const destPath = path.join(OUT, name);
    await copyFileOrDir(srcPath, destPath);
  }

  
}

main().catch((err) => {
  console.error("Failed to prepare obfuscation source:", err);
  process.exitCode = 1;
});
