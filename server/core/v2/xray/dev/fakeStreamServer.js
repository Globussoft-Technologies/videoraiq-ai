/**
 * Serve a real HLS stream where the Go streaming server would be, so the
 * X-ray overlay can be judged against actual video instead of a blank stage.
 *
 * WHY
 *
 * The seeded fixture camera points at http://127.0.0.1:8119, which is
 * videoraiq/streaming's port -- a Go service this work is forbidden to touch
 * and which is not running on this box. With nothing there the player shows an
 * empty stage, the X-Ray pill is DISABLED ("Camera stream is unavailable",
 * src/xray/buttonState.js), and the one question no instrument on any side can
 * answer -- whether the glow reads against real camera noise, whether 5 fps
 * feels like tracking or stepping -- stays unanswerable.
 *
 * This serves a directory that ffmpeg is filling with a rolling live playlist
 * (see dev/run-fake-stream.ps1). It is a STATIC FILE SERVER and nothing else:
 * it does not register cameras, mint tokens, or speak to the Go server's API.
 *
 * Deliberate choices:
 *   * ANY /stream/<whatever>/<file> maps to the same directory, so re-seeding
 *     the fixtures (which mints new ObjectIds) does not break it.
 *   * `?token=` is ignored. The real server authenticates HLS that way
 *     (middlewares/verifyToken.js:38 documents it, since <video> cannot send
 *     headers); here it is a dev fixture on loopback and pretending to check
 *     it would only mean inventing a second secret.
 *   * CORS is open, because the page is on :5173 and the stream on :8119, and
 *     hls.js needs it on the playlist AND every segment.
 *   * No directory listing and no path traversal: the request path is reduced
 *     to its basename before being joined to the root.
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/fakeStreamServer.js --root <dir> [--port 8119]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PORT = Number(argOf("port", 8119));
const ROOT = path.resolve(argOf("root", ""));

if (!ROOT || !fs.existsSync(ROOT)) {
  console.error(`--root must be an existing directory (got ${ROOT || "nothing"})`);
  process.exit(1);
}

const TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".m4s": "video/iso.segment",
  ".mp4": "video/mp4",
};

let served = 0;
let misses = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  // Only ever the basename: no traversal out of ROOT, whatever the path says.
  const name = path.basename(decodeURIComponent(url.pathname));
  const file = path.join(ROOT, name);
  const ext = path.extname(name).toLowerCase();

  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    // A rolling live playlist must never be cached: a stale one pins the
    // player to segments that have already been deleted.
    "cache-control": "no-store",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }

  if (!TYPES[ext] || !fs.existsSync(file)) {
    misses += 1;
    res.writeHead(404, { ...headers, "content-type": "text/plain" });
    return res.end("not here\n");
  }

  let body;
  try {
    body = fs.readFileSync(file);
  } catch (error) {
    res.writeHead(503, { ...headers, "content-type": "text/plain" });
    return res.end(`unreadable: ${error.code}\n`);
  }

  served += 1;
  res.writeHead(200, { ...headers, "content-type": TYPES[ext], "content-length": body.length });
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[fake-stream] http://127.0.0.1:${PORT}/stream/<any>/playlist.m3u8  ->  ${ROOT}`);
});

setInterval(() => {
  console.log(`[fake-stream] served ${served}, 404s ${misses}`);
}, 60_000).unref();
