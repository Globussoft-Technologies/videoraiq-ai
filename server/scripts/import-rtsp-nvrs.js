#!/usr/bin/env node
/**
 * Import Direct RTSP NVRs from a JSON array of:
 *   { "name": "Camera name", "rtspUrl": "rtsp://...", "location": "Site" }
 *
 * Cameras are grouped into one NVR per location + RTSP host + RTSP port.
 * Existing locations and NVR names are matched case-insensitively. Preview is
 * the default; pass --apply to create locations/NVRs and register streams.
 *
 * Node.js 18+ (no npm dependencies):
 *   node scripts/import-rtsp-nvrs.js "C:\\path\\cameras.json"
 *   node scripts/import-rtsp-nvrs.js "C:\\path\\cameras.json" --apply
 *   node scripts/import-rtsp-nvrs.js --self-check
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SCRIPT_CONFIG = {
  API_BASE_URL: "http://localhost:5001/api/v2", // Example: https://app-api.example.com/api/v2
  DASHBOARD_LOGIN: "",
  DASHBOARD_PASSWORD: "",
  NVR_BRAND: "dahua", // These URLs fit "dahua" or "cpplus"; choose the real brand.
};

const APPLY = process.argv.includes("--apply");
const SELF_CHECK = process.argv.includes("--self-check");
const inputPath = process.argv.slice(2).find((arg) => !["--apply", "--self-check"].includes(arg));

function configured(name) {
  return process.env[name] ?? SCRIPT_CONFIG[name];
}

function required(name) {
  const value = configured(name);
  if (!value) throw new Error(`Missing configuration value: ${name}`);
  return value;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function unwrap(response) {
  return response?.body?.data ?? response?.data ?? response;
}

function nvrName(location, hostname, port) {
  const suffix = `${hostname}:${port}`;
  const available = Math.max(1, 50 - suffix.length - 3);
  return `${location.slice(0, available).trim()} - ${suffix}`;
}

function parseRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Input must be a non-empty JSON array");
  }

  const seenUrls = new Set();
  return rows.map((row, index) => {
    const name = String(row?.name || "").trim();
    const location = String(row?.location || "").trim();
    if (!name || !location || !row?.rtspUrl) {
      throw new Error(`Row ${index + 1} requires name, rtspUrl, and location`);
    }

    let url;
    try {
      url = new URL(row.rtspUrl);
    } catch {
      throw new Error(`Row ${index + 1} has an invalid RTSP URL`);
    }
    if (!["rtsp:", "rtsps:"].includes(url.protocol)) {
      throw new Error(`Row ${index + 1} must use rtsp:// or rtsps://`);
    }
    if (seenUrls.has(row.rtspUrl)) throw new Error(`Duplicate RTSP URL at row ${index + 1}`);
    seenUrls.add(row.rtspUrl);

    return {
      name,
      location,
      rtspUrl: row.rtspUrl,
      hostname: url.hostname.toLowerCase(),
      port: url.port || (url.protocol === "rtsps:" ? "322" : "554"),
    };
  });
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${normalize(row.location)}|${row.hostname}|${row.port}`;
    if (!groups.has(key)) {
      groups.set(key, {
        location: row.location,
        hostname: row.hostname,
        port: row.port,
        cameras: [],
      });
    }
    groups.get(key).cameras.push({ name: row.name, rtspUrl: row.rtspUrl });
  }
  return [...groups.values()];
}

async function requestJson(baseUrl, apiPath, { token, ...options } = {}) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-access-token": token } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.body?.status === "failed") {
    const message = body?.body?.message || body?.message || response.statusText;
    const detail = body?.body?.error || body?.error;
    throw new Error(`${apiPath} failed (${response.status}): ${message}${detail ? ` - ${detail}` : ""}`);
  }
  return body;
}

async function login(baseUrl) {
  const response = await requestJson(baseUrl, "/auth/by-login-pass", {
    method: "POST",
    body: JSON.stringify({
      login: required("DASHBOARD_LOGIN"),
      pass: required("DASHBOARD_PASSWORD"),
    }),
  });
  if (!response?.token) throw new Error("Dashboard login did not return a token");
  return response.token;
}

async function fetchLocations(baseUrl, token) {
  const response = await requestJson(baseUrl, "/locations/fetch?skip=0&limit=1000", {
    method: "POST",
    token,
    body: "{}",
  });
  return unwrap(response)?.locations || [];
}

async function ensureLocations(baseUrl, token, groups) {
  const byName = new Map(
    (await fetchLocations(baseUrl, token))
      .filter((item) => item?.locationName)
      .map((item) => [normalize(item.locationName), item.locationName.trim()]),
  );

  for (const group of groups) {
    const key = normalize(group.location);
    if (!byName.has(key)) {
      if (APPLY) {
        await requestJson(baseUrl, "/locations/create", {
          method: "POST",
          token,
          body: JSON.stringify({ locationName: group.location }),
        });
        console.log(`Created location: ${group.location}`);
      } else {
        console.log(`Would create location: ${group.location}`);
      }
      byName.set(key, group.location);
    }
    group.location = byName.get(key);
  }
}

async function existingDirectNvrs(baseUrl, token) {
  const response = await requestJson(baseUrl, "/nvr?skip=0&limit=1000", { token });
  const nvrs = unwrap(response)?.nvrs || [];
  return new Set(
    nvrs
      .filter((nvr) => nvr?.connectionMode === "direct")
      .map((nvr) => `${normalize(nvr.nvrName)}|${normalize(nvr.location)}`),
  );
}

function selfCheck() {
  const rows = parseRows([
    { name: "A", location: "Plant", rtspUrl: "rtsp://u:p@10.0.0.1:554/cam?channel=1" },
    { name: "B", location: "plant", rtspUrl: "rtsp://u:p@10.0.0.1:555/cam?channel=1" },
    { name: "C", location: "PLANT", rtspUrl: "rtsp://u:p@10.0.0.1:554/cam?channel=2" },
  ]);
  const groups = groupRows(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.cameras.length).sort(), [1, 2]);
  assert.ok(nvrName("A very long location name", "10.0.0.1", "554").length <= 50);
}

async function main() {
  selfCheck();
  if (SELF_CHECK) {
    console.log("Self-check passed");
    return;
  }
  if (!inputPath) throw new Error("Provide the input JSON file path");

  const baseUrl = required("API_BASE_URL").replace(/\/$/, "");
  const brand = normalize(required("NVR_BRAND"));
  const allowedBrands = new Set(["hikvision", "cpplus", "dahua", "prama", "tiandy", "securus", "hanwha"]);
  if (!allowedBrands.has(brand)) throw new Error(`Unsupported NVR_BRAND: ${brand}`);

  const rows = parseRows(JSON.parse(await readFile(path.resolve(inputPath), "utf8")));
  const groups = groupRows(rows);
  const token = await login(baseUrl);

  await ensureLocations(baseUrl, token, groups);
  const existing = await existingDirectNvrs(baseUrl, token);
  let created = 0;
  let skipped = 0;

  for (const group of groups) {
    const name = nvrName(group.location, group.hostname, group.port);
    const identity = `${normalize(name)}|${normalize(group.location)}`;
    if (existing.has(identity)) {
      console.log(`Skipped existing NVR: ${name}`);
      skipped += 1;
      continue;
    }

    console.log(`${APPLY ? "Creating" : "Would create"} NVR: ${name} (${group.cameras.length} cameras)`);
    if (APPLY) {
      await requestJson(baseUrl, "/nvr/direct", {
        method: "POST",
        token,
        body: JSON.stringify({
          nvrName: name,
          location: group.location,
          brand,
          cameras: group.cameras,
        }),
      });
      existing.add(identity);
      created += 1;
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? "applied" : "dry-run",
    inputCameras: rows.length,
    nvrGroups: groups.length,
    created,
    skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
