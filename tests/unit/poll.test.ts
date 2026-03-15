import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { poll } from "../../src/internal/poller.js";

describe("poll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when fn returns a value on first call", async () => {
    const fn = vi.fn().mockResolvedValue({ postId: "123" });
    const polled = poll(fn, { maxAttempts: 5, intervalMs: 1000 });

    const result = await polled();

    expect(result).toEqual({ postId: "123" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries when fn returns undefined, resolves on second call", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ postId: "456" });
    const polled = poll(fn, { maxAttempts: 5, intervalMs: 100 });

    const promise = polled();
    // Advance timers so the retry gets executed
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ postId: "456" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after maxAttempts when fn always returns undefined", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const polled = poll(fn, { maxAttempts: 3, intervalMs: 100 });

    const promise = polled();
    const expectPromise = expect(promise).rejects.toThrow("Polling timed out");
    
    await vi.runAllTimersAsync();

    await expectPromise;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("re-throws errors from fn immediately (does not swallow them)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("upload failed"));
    const polled = poll(fn, { maxAttempts: 5, intervalMs: 100 });

    await expect(polled()).rejects.toThrow("upload failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes args through to fn correctly", async () => {
    const fn = vi.fn().mockResolvedValue("done");
    const polled = poll(fn, { maxAttempts: 3, intervalMs: 100 });

    await polled("arg1", 42);

    expect(fn).toHaveBeenCalledWith("arg1", 42);
  });

  it("uses default maxAttempts of 30 when none provided", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const polled = poll(fn);

    const promise = polled();
    const expectPromise = expect(promise).rejects.toThrow();

    await vi.runAllTimersAsync();

    await expectPromise;
    expect(fn).toHaveBeenCalledTimes(30);
  });
});
