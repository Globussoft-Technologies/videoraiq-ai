// Share only overlapping reads. Completed responses are never cached.
export function createPendingRead(maxPending = 128) {
  const pending = new Map();
  return async (key, read) => {
    let promise = pending.get(key);
    if (!promise) {
      if (pending.size >= maxPending) return read();
      promise = Promise.resolve().then(read);
      pending.set(key, promise);
      const clear = () => { if (pending.get(key) === promise) pending.delete(key); };
      promise.then(clear, clear);
    }
    // Consumers must not mutate another consumer's response.
    return structuredClone(await promise);
  };
}
