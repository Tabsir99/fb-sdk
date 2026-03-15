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
