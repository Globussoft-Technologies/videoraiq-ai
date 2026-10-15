import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const packageOnly = process.argv.includes("--package");
if (!packageOnly) {
  execSync("npm run swagger:all", { stdio: "inherit" });
}

for (const name of ["swagger-api-view.json", "swagger-api-v2-view.json"]) {
  const source = path.join("views", name);
  const spec = JSON.parse(fs.readFileSync(source, "utf8"));
  const count = Object.keys(spec.paths || {}).length;
  if (!count) throw new Error(`${name} has no API routes; refusing to package it.`);
  if (packageOnly) {
    fs.mkdirSync(path.join("dist", "views"), { recursive: true });
    fs.copyFileSync(source, path.join("dist", "views", name));
  }
  console.log(`${name}: ${count} API paths${packageOnly ? " packaged" : " generated"}`);
}
