import axios from "axios";
import { streamAlive } from "./stateMachine.js";

async function mapLimit(items, concurrency, operation) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await operation(items[index++]);
  }));
}

// Reuse the existing status API without starting streams or sending player heartbeats.
export async function readStatuses(cameras, settings, consume, isActive) {
  const groups = new Map();
  for (const camera of cameras) {
    if (camera.mappingError) {
      if (isActive()) await consume(camera, { observedAt: new Date(), alive: null });
    } else {
      const group = groups.get(camera.host) || [];
      group.push(camera);
      groups.set(camera.host, group);
    }
  }
  await mapLimit([...groups.entries()], settings.concurrency, async ([host, group]) => {
    for (let offset = 0; offset < group.length && isActive(); offset += settings.batchSize) {
      const batch = group.slice(offset, offset + settings.batchSize);
      let samples = new Map();
      try {
        const response = await axios.post(`${host}/api/cameras/status`, {
          ids: [...new Set(batch.map(camera => camera.statusId))],
        }, { timeout: settings.timeoutMs, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024 });
        if (Array.isArray(response.data?.cameras)) {
          samples = new Map(response.data.cameras.filter(sample => typeof sample?.id === "string").map(sample => [sample.id, sample]));
        }
      } catch { /* Status service failure is unavailable, not Down. */ }
      const observedAt = new Date();
      await mapLimit(batch, settings.concurrency, async camera => {
        if (isActive()) await consume(camera, { observedAt, alive: streamAlive(samples.get(camera.statusId)) });
      });
    }
  });
}
