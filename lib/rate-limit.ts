/**
 * Best-effort upstream throttling.
 *
 * One token bucket per host, held in module scope. A Worker runs across many
 * isolates, so this bounds fan-out from a single instance rather than
 * globally — per-isolate and best-effort by design, which is enough to keep
 * ordinary traffic under an API's per-second budget.
 */
const windows = new Map<string, { start: number; count: number }>();

/** Consumes one slot for `host`; waits out the window when the budget is gone. */
export async function acquire(host: string, perSecond: number): Promise<void> {
  const now = Date.now();
  const window = windows.get(host);

  if (!window || now - window.start >= 1000) {
    windows.set(host, { start: now, count: 1 });
    return;
  }

  if (window.count < perSecond) {
    window.count += 1;
    return;
  }

  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, window.start + 1000 - now);
  await promise;
  windows.set(host, { start: Date.now(), count: 1 });
}
