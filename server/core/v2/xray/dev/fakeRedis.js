/**
 * A tiny Redis stand-in, for running the relay on a machine with no Redis.
 *
 * THIS IS A DEV FIXTURE AND NOT A REDIS. It is in-memory, single-client-simple,
 * unauthenticated (it accepts any AUTH), and implements only the commands this
 * codebase actually issues. Never point anything real at it.
 *
 * It exists because Phase 4's fan-out genuinely needs Redis: socket.js records
 * `socket:session:<tab> -> socket.id` on connect, and that mapping is how a
 * mask finds the right browser tab (contract §9). Without it, the end-to-end
 * path cannot be demonstrated at all — the relay creates sessions with an empty
 * socket id and immediately asks the service to stop sending.
 *
 * Commands, chosen by grepping `redis.<cmd>(` across the codebase:
 *   AUTH PING SELECT QUIT INFO COMMAND CLIENT
 *   SET (EX/PX/NX/XX) GET DEL EXISTS EXPIRE TTL MGET INCR DECR
 *   HSET HGETALL SCAN
 *   SUBSCRIBE UNSUBSCRIBE PSUBSCRIBE PUNSUBSCRIBE PUBLISH
 *
 * Anything else answers -ERR, loudly, so a missing command shows up as a clear
 * failure rather than silently wrong behaviour.
 *
 * Usage:
 *   node core/v2/xray/dev/fakeRedis.js [--port 6379] [--verbose]
 */
import net from "node:net";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const VERBOSE = process.argv.includes("--verbose");
const PORT = Number(argOf("port", 6379));

const log = (...parts) => console.log("[fake-redis]", ...parts);
const trace = (...parts) => VERBOSE && log(...parts);

/** key -> string value */
const store = new Map();
/** key -> Map(field -> value) */
const hashes = new Map();
/** key -> expiry timestamp (ms) */
const expiries = new Map();
/** channel -> Set(socket) */
const channels = new Map();

const expired = (key) => {
  const at = expiries.get(key);
  if (at && Date.now() > at) {
    store.delete(key);
    hashes.delete(key);
    expiries.delete(key);
    return true;
  }
  return false;
};

// --- RESP encoding ---------------------------------------------------------

const ok = () => "+OK\r\n";
const simple = (s) => `+${s}\r\n`;
const err = (s) => `-ERR ${s}\r\n`;
const int = (n) => `:${n}\r\n`;
const nil = () => "$-1\r\n";
const bulk = (s) =>
  s === null || s === undefined ? nil() : `$${Buffer.byteLength(String(s))}\r\n${s}\r\n`;
const array = (items) => `*${items.length}\r\n${items.join("")}`;

// --- RESP decoding: one streaming parser per connection --------------------

/**
 * Pull as many complete commands as possible out of `buffer`.
 * Returns { commands, rest }.
 */
const parse = (buffer) => {
  const commands = [];
  let text = buffer;

  while (text.length) {
    if (text[0] !== "*") {
      // Inline command (redis-cli style, and what a bare PING looks like).
      const end = text.indexOf("\r\n");
      if (end === -1) break;
      const parts = text.slice(0, end).trim().split(/\s+/).filter(Boolean);
      if (parts.length) commands.push(parts);
      text = text.slice(end + 2);
      continue;
    }

    const headerEnd = text.indexOf("\r\n");
    if (headerEnd === -1) break;
    const count = Number(text.slice(1, headerEnd));
    let cursor = headerEnd + 2;
    const parts = [];
    let complete = true;

    for (let i = 0; i < count; i += 1) {
      if (text[cursor] !== "$") {
        complete = false;
        break;
      }
      const lenEnd = text.indexOf("\r\n", cursor);
      if (lenEnd === -1) {
        complete = false;
        break;
      }
      const len = Number(text.slice(cursor + 1, lenEnd));
      const start = lenEnd + 2;
      if (text.length < start + len + 2) {
        complete = false;
        break;
      }
      parts.push(text.slice(start, start + len));
      cursor = start + len + 2;
    }

    if (!complete) break;
    commands.push(parts);
    text = text.slice(cursor);
  }

  return { commands, rest: text };
};

// --- the commands ----------------------------------------------------------

const run = (socket, parts) => {
  const name = String(parts[0] || "").toUpperCase();
  const args = parts.slice(1);
  trace(name, args.slice(0, 2).join(" "));

  switch (name) {
    case "AUTH": // any password; this is a fixture
    case "SELECT":
    case "CLIENT":
      return ok();
    case "QUIT":
      socket.end(ok());
      return "";
    case "PING":
      return args.length ? bulk(args[0]) : simple("PONG");
    case "INFO":
      return bulk("# Server\r\nredis_version:0.0.0-fake\r\nrole:master\r\n");
    case "COMMAND":
      return array([]);

    case "SET": {
      const [key, value, ...rest] = args;
      const flags = rest.map((f) => String(f).toUpperCase());
      if (flags.includes("NX") && (store.has(key) || hashes.has(key)) && !expired(key)) return nil();
      if (flags.includes("XX") && !store.has(key)) return nil();
      store.set(key, String(value));
      expiries.delete(key);
      const ex = flags.indexOf("EX");
      const px = flags.indexOf("PX");
      if (ex !== -1 && rest[ex + 1]) expiries.set(key, Date.now() + Number(rest[ex + 1]) * 1000);
      if (px !== -1 && rest[px + 1]) expiries.set(key, Date.now() + Number(rest[px + 1]));
      return ok();
    }

    case "GET": {
      const key = args[0];
      expired(key);
      return store.has(key) ? bulk(store.get(key)) : nil();
    }

    case "MGET":
      return array(
        args.map((key) => {
          expired(key);
          return store.has(key) ? bulk(store.get(key)) : nil();
        }),
      );

    case "DEL": {
      let removed = 0;
      for (const key of args) {
        if (store.delete(key) || hashes.delete(key)) removed += 1;
        expiries.delete(key);
      }
      return int(removed);
    }

    case "EXISTS":
      return int(args.filter((key) => !expired(key) && (store.has(key) || hashes.has(key))).length);

    case "EXPIRE": {
      const [key, seconds] = args;
      if (!store.has(key) && !hashes.has(key)) return int(0);
      expiries.set(key, Date.now() + Number(seconds) * 1000);
      return int(1);
    }

    case "TTL": {
      const key = args[0];
      if (expired(key) || (!store.has(key) && !hashes.has(key))) return int(-2);
      const at = expiries.get(key);
      return int(at ? Math.max(0, Math.round((at - Date.now()) / 1000)) : -1);
    }

    case "INCR":
    case "DECR": {
      const key = args[0];
      expired(key);
      const next = (Number(store.get(key)) || 0) + (name === "INCR" ? 1 : -1);
      store.set(key, String(next));
      return int(next);
    }

    case "HSET": {
      const [key, ...rest] = args;
      const hash = hashes.get(key) || new Map();
      let added = 0;
      for (let i = 0; i < rest.length; i += 2) {
        if (!hash.has(rest[i])) added += 1;
        hash.set(rest[i], rest[i + 1]);
      }
      hashes.set(key, hash);
      return int(added);
    }

    case "HGETALL": {
      const hash = hashes.get(args[0]);
      if (!hash) return array([]);
      const flat = [];
      for (const [field, value] of hash) flat.push(bulk(field), bulk(value));
      return array(flat);
    }

    case "SCAN": {
      // One pass, no real cursor: every key fits in memory here.
      const matchIndex = args.findIndex((a) => String(a).toUpperCase() === "MATCH");
      const pattern = matchIndex !== -1 ? args[matchIndex + 1] : "*";
      const re = new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
      const keys = [...store.keys(), ...hashes.keys()].filter((k) => !expired(k) && re.test(k));
      return array([bulk("0"), array(keys.map(bulk))]);
    }

    case "SUBSCRIBE":
    case "PSUBSCRIBE": {
      const replies = [];
      args.forEach((channel, i) => {
        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel).add(socket);
        replies.push(array([bulk(name.toLowerCase()), bulk(channel), int(i + 1)]));
      });
      return replies.join("");
    }

    case "UNSUBSCRIBE":
    case "PUNSUBSCRIBE": {
      for (const set of channels.values()) set.delete(socket);
      return array([bulk(name.toLowerCase()), nil(), int(0)]);
    }

    case "PUBLISH": {
      const [channel, payload] = args;
      const subscribers = channels.get(channel) || new Set();
      for (const subscriber of subscribers) {
        subscriber.write(array([bulk("message"), bulk(channel), bulk(payload)]));
      }
      return int(subscribers.size);
    }

    default:
      log(`UNSUPPORTED command: ${name} — add it to dev/fakeRedis.js if it matters`);
      return err(`unknown command '${name}' (this is a dev fixture, not Redis)`);
  }
};

net
  .createServer((socket) => {
    let buffer = "";
    socket.setNoDelay(true);
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const { commands, rest } = parse(buffer);
      buffer = rest;
      for (const parts of commands) {
        try {
          const reply = run(socket, parts);
          if (reply) socket.write(reply);
        } catch (error) {
          socket.write(err(error.message));
        }
      }
    });
    socket.on("close", () => {
      for (const set of channels.values()) set.delete(socket);
    });
    socket.on("error", () => {
      for (const set of channels.values()) set.delete(socket);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    log(`listening on 127.0.0.1:${PORT} — in-memory, accepts any AUTH`);
    log("this is a DEV FIXTURE. Never point production at it.");
  });
