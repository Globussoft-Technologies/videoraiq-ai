// Deterministic Redis command surface for cache behavior tests (no live Redis).
export function fakeApiCacheRedis() {
  const values = new Map([["videoraiq:api-cache:v1:epoch", { value: "test-epoch", expires: Infinity }]]);
  let now = 0;
  const redis = {
    async get(key) {
      const entry = values.get(key);
      return entry && entry.expires > now ? entry.value : null;
    },
    async mget(...keys) { return Promise.all(keys.map(key => redis.get(key))); },
    async set(key, value, _ex, ttl) {
      if (_ex === "NX" && await redis.get(key)) return null;
      values.set(key, { value, expires: ttl ? now + ttl * 1000 : Infinity });
      return "OK";
    },
    multi() {
      const commands = [];
      const batch = {
        set(...args) { commands.push(args); return batch; },
        async exec() { return Promise.all(commands.map(async args => [null, await redis.set(...args)])); },
      };
      return batch;
    },
    advance(ms) { now += ms; },
    values,
  };
  return redis;
}
