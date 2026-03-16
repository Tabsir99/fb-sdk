import { describe, it, expect, vi } from "vitest";
import { createBatchResource } from "../../src/resources/createBatchResource.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";
import type { HttpClient } from "../../src/httpClient.js";
import type { BatchSubResponse } from "../../src/types/shared.js";
import type FormData from "form-data";

function createMockHttp(postResponses: BatchSubResponse[][]): HttpClient {
  let callIndex = 0;
  return {
    get: vi.fn() as unknown as HttpClient["get"],
    post: vi.fn(() => {
      const responses = postResponses[callIndex++]!;
      return createBatchableRequest("POST", "/", async () => responses);
    }) as unknown as HttpClient["post"],
    delete: vi.fn() as unknown as HttpClient["delete"],
    getToken: () => "test-token",
  };
}

describe("createBatchResource", () => {
  describe("batch size handling", () => {
    it("sends a single batch request for ≤50 requests", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 200, body: '{"id":"1"}' },
        { code: 200, body: '{"id":"2"}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req1 = createBatchableRequest("GET", "1/posts", async () => ({}));
      const req2 = createBatchableRequest("GET", "2/posts", async () => ({}));
      const results = await batch([req1, req2]);

      expect(http.post).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
    });

    it("chunks into multiple batch requests when >50 requests", async () => {
      const chunk1Responses: BatchSubResponse[] = Array.from({ length: 50 }, (_, i) => ({
        code: 200,
        body: JSON.stringify({ id: String(i) }),
      }));
      const chunk2Responses: BatchSubResponse[] = Array.from({ length: 5 }, (_, i) => ({
        code: 200,
        body: JSON.stringify({ id: String(50 + i) }),
      }));
      const http = createMockHttp([chunk1Responses, chunk2Responses]);
      const batch = createBatchResource(http);

      const requests = Array.from({ length: 55 }, (_, i) =>
        createBatchableRequest("GET", `${i}/feed`, async () => ({})),
      );
      const results = await batch(requests);

      expect(http.post).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(55);
    });

    it("handles empty responses array gracefully", async () => {
      const http = createMockHttp([]);
      const batch = createBatchResource(http);
      const results = await batch([]);

      expect(http.post).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });
  });

  describe("processResponse behavior", () => {
    it("applies _transform when present on a request", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 200, body: '{"name":"hello","value":42}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req = createBatchableRequest(
        "GET",
        "me/posts",
        async () => ({ name: "hello", value: 42 }),
      ).transform((r) => r.value);

      const results = await batch([req]);
      expect(results[0]!.status).toBe(200);
      expect(results[0]!.data).toBe(42);
    });

    it("returns raw parsed data when _transform is not present", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 200, body: '{"some_key":"val"}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req = createBatchableRequest("GET", "path", async () => ({}));
      const results = await batch([req]);

      expect(results[0]!.status).toBe(200);
      // toCamel converts some_key -> someKey
      expect(results[0]!.data).toEqual({ someKey: "val" });
    });

    it("returns { status: code, data: body } for non-200 responses without parsing", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 400, body: '{"error":{"message":"Invalid"}}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req = createBatchableRequest("GET", "path", async () => ({}));
      const results = await batch([req]);

      expect(results[0]!.status).toBe(400);
      expect(results[0]!.data).toBe('{"error":{"message":"Invalid"}}');
    });
  });

  describe("options", () => {
    it("includeHeaders defaults to 'false'", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 200, body: '{"id":"1"}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req = createBatchableRequest("GET", "path", async () => ({}));
      await batch([req]);

      const postCall = vi.mocked(http.post).mock.calls[0]!;
      const formData = postCall[1] as unknown as FormData;
      const formContent = formData.getBuffer().toString();
      expect(formContent).toContain("false");
    });

    it("passes 'true' when includeHeaders is set", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 200, body: '{"id":"1"}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req = createBatchableRequest("GET", "path", async () => ({}));
      await batch([req], { includeHeaders: true });

      const postCall = vi.mocked(http.post).mock.calls[0]!;
      const formData = postCall[1] as unknown as FormData;
      const formContent = formData.getBuffer().toString();
      expect(formContent).toContain("true");
      expect(formContent).not.toContain("false");
    });
  });

  describe("result ordering", () => {
    it("return type is a tuple matching input order", async () => {
      const batchResponse: BatchSubResponse[] = [
        { code: 200, body: '{"first":true}' },
        { code: 200, body: '{"second":true}' },
        { code: 200, body: '{"third":true}' },
      ];
      const http = createMockHttp([batchResponse]);
      const batch = createBatchResource(http);

      const req1 = createBatchableRequest("GET", "a", async () => ({}));
      const req2 = createBatchableRequest("GET", "b", async () => ({}));
      const req3 = createBatchableRequest("GET", "c", async () => ({}));
      const results = await batch([req1, req2, req3]);

      expect(results[0]!.data).toEqual({ first: true });
      expect(results[1]!.data).toEqual({ second: true });
      expect(results[2]!.data).toEqual({ third: true });
    });
  });
});
