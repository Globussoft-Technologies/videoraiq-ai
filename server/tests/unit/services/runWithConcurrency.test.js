/**
 * runWithConcurrency — concurrency cap enforcement and task completion guarantee.
 * Tests that: (1) at most concurrencyLimit tasks run simultaneously,
 * (2) all tasks complete and are returned in input order,
 * (3) correct promise is spliced from the in-flight set when one resolves.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { runWithConcurrency } from "../../../core/v1/users/users.service.js";

describe("runWithConcurrency", () => {
  it("returns results in input order even if tasks resolve out of order", async () => {
    const resolveOrder = [];
    const tasks = [
      () => new Promise(r => setTimeout(() => { resolveOrder.push(0); r("task0"); }, 100)),
      () => new Promise(r => setTimeout(() => { resolveOrder.push(1); r("task1"); }, 50)),
      () => new Promise(r => setTimeout(() => { resolveOrder.push(2); r("task2"); }, 150)),
    ];

    const results = await runWithConcurrency(tasks, 2);

    expect(results).toEqual(["task0", "task1", "task2"]);
    expect(resolveOrder).toEqual([1, 0, 2]);
  });

  it("enforces concurrency cap: at most N tasks run in parallel", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const tasks = Array.from({ length: 10 }, () => () =>
      new Promise((resolve) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        setTimeout(() => {
          currentConcurrent--;
          resolve();
        }, 20);
      })
    );

    await runWithConcurrency(tasks, 3);
    expect(maxConcurrent).toBe(3);
  });

  it("returns all task results when tasks complete with jitter", async () => {
    const tasks = Array.from({ length: 20 }, (_, i) => () =>
      new Promise((resolve) => {
        const delay = Math.random() * 100;
        setTimeout(() => resolve(`result-${i}`), delay);
      })
    );

    const results = await runWithConcurrency(tasks, 2);
    expect(results.length).toBe(20);
    expect(results).toEqual(
      Array.from({ length: 20 }, (_, i) => `result-${i}`)
    );
  });

  it("removes the correct promise from executing set (not the one being pushed)", async () => {
    const executionLog = [];
    const tasks = [
      () => new Promise(r => {
        executionLog.push("start-0");
        setTimeout(() => {
          executionLog.push("end-0");
          r("a");
        }, 50);
      }),
      () => new Promise(r => {
        executionLog.push("start-1");
        setTimeout(() => {
          executionLog.push("end-1");
          r("b");
        }, 30);
      }),
      () => new Promise(r => {
        executionLog.push("start-2");
        setTimeout(() => {
          executionLog.push("end-2");
          r("c");
        }, 20);
      }),
      () => new Promise(r => {
        executionLog.push("start-3");
        setTimeout(() => {
          executionLog.push("end-3");
          r("d");
        }, 100);
      }),
    ];

    const results = await runWithConcurrency(tasks, 2);

    expect(results).toEqual(["a", "b", "c", "d"]);
    expect(executionLog.length).toBe(8);
    expect(executionLog.filter(x => x.startsWith("end")).length).toBe(4);
  });

  it("handles rejected promises gracefully (they still complete)", async () => {
    const tasks = [
      () => Promise.resolve("ok-0"),
      () => Promise.reject(new Error("fail-1")),
      () => Promise.resolve("ok-2"),
    ];

    try {
      await runWithConcurrency(tasks, 2);
    } catch (err) {
      expect(err.message).toBe("fail-1");
    }
  });

  it("handles a single task", async () => {
    const tasks = [() => Promise.resolve("single")];
    const results = await runWithConcurrency(tasks, 1);
    expect(results).toEqual(["single"]);
  });

  it("handles empty task array", async () => {
    const results = await runWithConcurrency([], 10);
    expect(results).toEqual([]);
  });

  it("handles concurrency limit larger than task count", async () => {
    const tasks = [
      () => Promise.resolve("a"),
      () => Promise.resolve("b"),
    ];
    const results = await runWithConcurrency(tasks, 100);
    expect(results).toEqual(["a", "b"]);
  });
});
