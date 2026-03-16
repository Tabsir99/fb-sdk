import { describe, it, expect, vi } from "vitest";
import {
  createBatchableRequest,
  buildRelativeUrl,
} from "../../src/internal/batchable.js";

describe("batchable", () => {
  describe("createBatchableRequest", () => {
    it("returns object with correct method and relative_url synchronously (before any await)", () => {
      const req = createBatchableRequest("GET", "123/posts", async () => "data");
      expect(req.method).toBe("GET");
      expect(req.relative_url).toBe("123/posts");
    });

    it("does NOT call executor when creating the request (only when awaited)", () => {
      const executor = vi.fn().mockResolvedValue("result");
      createBatchableRequest("GET", "path", executor);
      expect(executor).not.toHaveBeenCalled();
    });

    it("calls executor and returns its value when awaited", async () => {
      const executor = vi.fn().mockResolvedValue({ id: "1" });
      const req = createBatchableRequest("GET", "path", executor);
      const result = await req;
      expect(result).toEqual({ id: "1" });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it("calls executor and rejects with its error on .catch()", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("fail"));
      const req = createBatchableRequest("GET", "path", executor);
      await expect(req).rejects.toThrow("fail");
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe(".transform() chain", () => {
    it("returns a new BatchableRequest with the same method and relative_url", () => {
      const req = createBatchableRequest("GET", "me/posts", async () => ({ id: "1", name: "test" }));
      const transformed = req.transform((r) => r.id);
      expect(transformed.method).toBe("GET");
      expect(transformed.relative_url).toBe("me/posts");
    });

    it("awaiting a transformed request applies the transform function", async () => {
      const req = createBatchableRequest("GET", "path", async () => ({ id: "1", value: 42 }));
      const result = await req.transform((r) => r.value * 2);
      expect(result).toBe(84);
    });

    it("chaining multiple .transform() calls composes them left-to-right", async () => {
      const req = createBatchableRequest("GET", "path", async () => 10);
      const result = await req.transform((n) => n + 5).transform((n) => n * 2);
      expect(result).toBe(30); // (10 + 5) * 2
    });

    it("does not call the executor until awaited", () => {
      const executor = vi.fn().mockResolvedValue("data");
      const req = createBatchableRequest("GET", "path", executor);
      req.transform((v) => v);
      expect(executor).not.toHaveBeenCalled();
    });

    it("sets _transform at runtime on the transformed request", () => {
      const req = createBatchableRequest("GET", "path", async () => "data");
      const transformed = req.transform((v) => v.toUpperCase());
      expect("_transform" in transformed).toBe(true);
    });

    it("_transform produces the same result as awaiting for the same input", async () => {
      const input = { id: "1", count: 5 };
      const fn = (r: typeof input) => r.count * 3;
      const req = createBatchableRequest("GET", "path", async () => input);
      const transformed = req.transform(fn);

      const awaitResult = await transformed;
      const transformFn = (transformed as unknown as { _transform: (raw: typeof input) => number })._transform;
      const batchResult = transformFn(input);

      expect(batchResult).toBe(awaitResult);
    });

    it("does not mutate the original request", () => {
      const original = createBatchableRequest("GET", "path", async () => ({ x: 1 }));
      original.transform((r) => r.x);
      expect("_transform" in original).toBe(false);
    });

    it(".catch() on a transformed request catches executor errors", async () => {
      const req = createBatchableRequest("GET", "path", async () => {
        throw new Error("boom");
        return ""; // unreachable, for type inference
      });
      const transformed = req.transform((v) => v.toUpperCase());
      await expect(transformed).rejects.toThrow("boom");
    });
  });

  describe("buildRelativeUrl", () => {
    it("strips leading slash", () => {
      expect(buildRelativeUrl("/123/posts", {})).toBe("123/posts");
    });

    it("leaves path without slash unchanged", () => {
      expect(buildRelativeUrl("123/posts", {})).toBe("123/posts");
    });

    it("appends params to path", () => {
      expect(buildRelativeUrl("123", { limit: 5 })).toBe("123?limit=5");
    });

    it("skips undefined params", () => {
      expect(buildRelativeUrl("123", { limit: undefined })).toBe("123");
    });

    it("converts camelCase param keys to snake_case", () => {
      expect(buildRelativeUrl("123", { createdTime: "x" })).toBe(
        "123?created_time=x"
      );
    });

    it("handles multiple params", () => {
      expect(buildRelativeUrl("123", { limit: 5, order: "desc" })).toBe(
        "123?limit=5&order=desc"
      );
    });

    it("URI encodes param values", () => {
      expect(buildRelativeUrl("123", { fields: "id,message" })).toBe(
        "123?fields=id%2Cmessage"
      );
    });
  });
});
