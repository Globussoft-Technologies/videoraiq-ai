import { spawn } from "child_process";
import { randomUUID } from "crypto";
import ffmpegStatic from "ffmpeg-static";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { openSecurusPlaybackSource } from "./securusDvrip.js";

const SESSION_TTL_MS = 10 * 60 * 1000;
const PLAYLIST_WAIT_MS = 12000;
const sessions = new Map();
const sessionsByKey = new Map();
const sessionRoot = path.join(os.tmpdir(), "videoraiq-securus-playback");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function removeDirectory(directory) {
  try {
    await fs.rm(directory, { recursive: true, force: true });
  } catch {
    // A failed cleanup must not terminate playback requests.
  }
}

function stopSession(session) {
  if (!session || session.stopped) return;
  session.stopped = true;
  session.source?.stop();
  session.ffmpeg?.kill("SIGTERM");
}

async function deleteSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  stopSession(session);
  sessions.delete(sessionId);
  if (sessionsByKey.get(session.key) === sessionId) sessionsByKey.delete(session.key);
  await removeDirectory(session.directory);
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) deleteSession(sessionId);
  }
}, 60 * 1000);
cleanupTimer.unref?.();

function ffmpegArguments(codec, directory) {
  const playlist = path.join(directory, "playlist.m3u8");
  const segmentPattern = path.join(directory, "segment_%06d.ts");
  const outputCodec = codec === "hevc"
    ? ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"]
    : ["-c:v", "copy"];

  return [
    "-hide_banner",
    "-loglevel", "warning",
    "-fflags", "+genpts+discardcorrupt",
    "-r", "15",
    "-f", codec,
    "-i", "pipe:0",
    ...outputCodec,
    "-an",
    "-f", "hls",
    "-hls_time", "2",
    // Playback is finite and FFmpeg may read it faster than real time. Keep
    // every segment so the browser never joins after the beginning was
    // already deleted; FFmpeg writes EXT-X-ENDLIST when the source finishes.
    "-hls_list_size", "0",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", segmentPattern,
    playlist,
  ];
}

async function waitForPlaylist(session) {
  const deadline = Date.now() + PLAYLIST_WAIT_MS;
  const playlist = path.join(session.directory, "playlist.m3u8");
  while (Date.now() < deadline) {
    if (session.error) throw session.error;
    try {
      const stat = await fs.stat(playlist);
      if (stat.size > 0) return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(100);
  }
  throw new Error("Timed out while preparing Securus playback");
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

export async function startSecurusPlaybackSession({
  ip,
  port,
  username,
  password,
  recordings,
  key,
}) {
  const previousId = sessionsByKey.get(key);
  if (previousId) await deleteSession(previousId);

  const id = randomUUID();
  const directory = path.join(sessionRoot, id);
  await fs.mkdir(directory, { recursive: true });

  let source;
  const session = {
    id,
    key,
    directory,
    expiresAt: Date.now() + SESSION_TTL_MS,
    stopped: false,
    error: null,
    source: null,
    ffmpeg: null,
  };

  try {
    source = await openSecurusPlaybackSource({
      ip,
      port,
      username,
      password,
      recordings,
    });
    session.source = source;

    const codec = await Promise.race([
      source.codec,
      delay(10000).then(() => {
        throw new Error("Timed out waiting for video from the Securus NVR");
      }),
    ]);

    const ffmpeg = spawn(
      process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg",
      ffmpegArguments(codec, directory),
      { stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
    );
    session.ffmpeg = ffmpeg;

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4096);
    });
    ffmpeg.on("error", (error) => {
      session.error = new Error(`Unable to start FFmpeg for Securus playback: ${error.message}`);
      source.stop();
    });
    ffmpeg.on("exit", (code, signal) => {
      if (!session.stopped && code !== 0) {
        session.error = new Error(
          `Securus video conversion stopped (${signal || code}): ${stderr.trim() || "unknown FFmpeg error"}`,
        );
      }
      source.stop();
    });
    source.stream.on("error", (error) => {
      session.error = error;
      if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.destroy(error);
    });
    ffmpeg.stdin.on("error", () => source.stop());
    source.stream.pipe(ffmpeg.stdin);

    await waitForSpawn(ffmpeg);
    sessions.set(id, session);
    sessionsByKey.set(key, id);
    await waitForPlaylist(session);
    return { id };
  } catch (error) {
    stopSession(session);
    sessions.delete(id);
    if (sessionsByKey.get(key) === id) sessionsByKey.delete(key);
    await removeDirectory(directory);
    throw error;
  }
}

export function rewriteSecurusPlaylist(playlist, token) {
  return String(playlist)
    .split(/\r?\n/)
    .map((line) => {
      if (!line || line.startsWith("#")) return line;
      const separator = line.includes("?") ? "&" : "?";
      return `${line}${separator}token=${encodeURIComponent(token || "")}`;
    })
    .join("\n");
}

export async function serveSecurusPlaybackFile(req, res) {
  const { sessionId, file } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).send("Playback session not found or expired");
  if (file !== "playlist.m3u8" && !/^segment_\d{6}\.ts$/.test(file)) {
    return res.status(400).send("Invalid playback file");
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  const filename = path.join(session.directory, file);
  try {
    if (file === "playlist.m3u8") {
      const playlist = await fs.readFile(filename, "utf8");
      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      });
      return res.status(200).send(rewriteSecurusPlaylist(playlist, req.query?.token));
    }

    const segment = await fs.readFile(filename);
    res.set({
      "Content-Type": "video/mp2t",
      "Cache-Control": "no-store",
    });
    return res.status(200).send(segment);
  } catch (error) {
    if (error.code === "ENOENT") {
      if (session.error) return res.status(502).send(session.error.message);
      return res.status(404).send("Playback data is not ready");
    }
    throw error;
  }
}
