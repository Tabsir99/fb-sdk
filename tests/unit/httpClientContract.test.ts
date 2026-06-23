import { describe, it, expect, vi } from "vitest";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import FormData from "form-data";
import { createHttpClient } from "../../src/httpClient.js";
import { createBatchResource } from "../../src/resources/createBatchResource.js";
import type { BatchSubRequest } from "../../src/types/shared.js";

/**
 * Contract tests for the REAL request pipeline (axios instance included).
 *
 * Unlike the other unit tests, nothing here replaces the HttpClient or the
 * executor — we inject a custom axios `adapter` through request options, so the
 * full chain runs: config merging → adapter → transformResponse → unwrap.
 * The 1.2.x regressions (dropped access_token, unwrapped AxiosResponse,
 * value-mangling, empty batch results) all lived below the old mocks and are
 * pinned here.
 */

const TOKEN = "test-token-123";

type Captured = { config: InternalAxiosRequestConfig };

function jsonAdapter(body: unknown, captured?: Captured) {
  return vi.fn(async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    if (captured) captured.config = config;
    return {
      data: typeof body === "string" ? body : JSON.stringify(body),
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  });
}

describe("httpClient contract (real axios pipeline)", () => {
  describe("GET", () => {
    it("always sends access_token merged with user params", async () => {
      const captured = {} as Captured;
      const adapter = jsonAdapter({ id: "1" }, captured);
      const http = createHttpClient(TOKEN);

      await http.get("/me", { params: { fields: "id" }, adapter });

      expect(captured.config.params).toEqual({ access_token: TOKEN, fields: "id" });
    });

    it("resolves the response BODY, not the axios envelope", async () => {
      const http = createHttpClient(TOKEN);
      const result = await http.get<{ id: string }>("/me", {
        adapter: jsonAdapter({ id: "42" }),
      });

      expect(result).toEqual({ id: "42" });
      expect(result).not.toHaveProperty("status");
      expect(result).not.toHaveProperty("config");
    });

    it("camelizes response keys but leaves string values untouched", async () => {
      const http = createHttpClient(TOKEN);
      const result = await http.get<any>("/me", {
        adapter: jsonAdapter({
          created_time: "2024-01-01",
          message: "check_this out",
          paging: { cursors: { after: "QVFIU_n3" } },
        }),
      });

      expect(result).toEqual({
        createdTime: "2024-01-01",
        message: "check_this out",
        paging: { cursors: { after: "QVFIU_n3" } },
      });
    });

    it("is single-flight: awaiting the same request twice fires one HTTP call", async () => {
      const adapter = jsonAdapter({ id: "1" });
      const http = createHttpClient(TOKEN);
      const req = http.get("/me", { adapter });

      await req;
      await req;

      expect(adapter).toHaveBeenCalledTimes(1);
    });

    it("resolves non-JSON bodies raw instead of throwing a parse error", async () => {
      const http = createHttpClient(TOKEN);
      const result = await http.get<string>("/me", {
        adapter: jsonAdapter("<html>bad gateway</html>"),
      });

      expect(result).toBe("<html>bad gateway</html>");
    });
  });

  describe("POST", () => {
    it("sends access_token, snake_cases body keys, and preserves body values", async () => {
      const captured = {} as Captured;
      const adapter = jsonAdapter({ success: true }, captured);
      const http = createHttpClient(TOKEN);

      await http.post("/123", { isHidden: false, message: "Hello World" }, { adapter });

      expect(captured.config.params).toEqual({ access_token: TOKEN });
      expect(captured.config.data).toEqual(
        JSON.stringify({ is_hidden: false, message: "Hello World" }),
      );
    });

    it("carries a urlencoded body on the batch sub-request descriptor", () => {
      const http = createHttpClient(TOKEN);
      const req = http.post("/123/comments", {
        message: "hi there",
        expiration: { type: "expire_only", time: 99 },
      }) as unknown as BatchSubRequest;

      expect(req.method).toBe("POST");
      expect(req.body).toBe(
        "message=hi+there&expiration=%7B%22type%22%3A%22expire_only%22%2C%22time%22%3A99%7D",
      );
      // JSON.stringify is what batch() sends to Facebook — body must survive it
      expect(JSON.parse(JSON.stringify(req))).toEqual({
        method: "POST",
        relative_url: "123/comments",
        body: req.body,
      });
    });

    it("includes query params in the batch relative_url", () => {
      const http = createHttpClient(TOKEN);
      const req = http.post("/1/video_reels", null, { params: { upload_phase: "START" } });

      expect(req.relative_url).toBe("1/video_reels?upload_phase=START");
    });

    it("does not attach a body descriptor for FormData uploads", () => {
      const http = createHttpClient(TOKEN);
      const form = new FormData();
      form.append("source", "x");
      const req = http.post("/1/photos", form) as unknown as BatchSubRequest;

      expect(req.body).toBeUndefined();
    });
  });

  describe("DELETE", () => {
    it("always sends access_token merged with user params", async () => {
      const captured = {} as Captured;
      const adapter = jsonAdapter({ success: true }, captured);
      const http = createHttpClient(TOKEN);

      await http.delete("/123", { params: { source: "api" }, adapter });

      expect(captured.config.params).toEqual({ access_token: TOKEN, source: "api" });
    });
  });

  describe("batch through the real http client", () => {
    it("returns parsed per-sub-request results, not an empty array", async () => {
      const subResponses = [
        { code: 200, body: JSON.stringify({ id: "a", created_time: "t" }) },
        { code: 400, body: '{"error":{"message":"bad"}}' },
      ];
      const http = createHttpClient(TOKEN);
      // batch() builds its own POST internally — route it through our adapter
      const httpWithAdapter: typeof http = {
        ...http,
        post: (path, data) => http.post(path, data, { adapter: jsonAdapter(subResponses) }),
      };

      const batch = createBatchResource(httpWithAdapter);
      const results = await batch([
        { method: "GET", relative_url: "a" },
        { method: "GET", relative_url: "b" },
      ]);

      expect(results).toEqual([
        { status: 200, data: { id: "a", createdTime: "t" } },
        { status: 400, data: '{"error":{"message":"bad"}}' },
      ]);
    });
  });
});
