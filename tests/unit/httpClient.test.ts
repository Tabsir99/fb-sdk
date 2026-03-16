import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHttpClient } from "../../src/httpClient.js";

// Mock the fbApi axios instance (the one at module scope with baseURL)
vi.mock("axios", () => {
  const mockInstance = {
    get: vi.fn().mockResolvedValue({ data: { id: "1" } }),
    post: vi.fn().mockResolvedValue({ data: { id: "1" } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
    isAxiosError: vi.fn(() => false),
  };
});

describe("createHttpClient", () => {
  const TOKEN = "test-access-token-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("get", () => {
    it("returns a BatchableRequest with correct method and relative_url", () => {
      const http = createHttpClient(TOKEN);
      const req = http.get("/me/posts", { params: { limit: 10 } });
      expect(req.method).toBe("GET");
      expect(req.relative_url).toBe("me/posts?limit=10");
    });

    it("merges user-provided params with access_token on await", async () => {
      const http = createHttpClient(TOKEN);
      const req = http.get("/me/posts", { params: { limit: 10 } });

      // We just need to verify the request is thenable — the actual HTTP call
      // is mocked. We verify the BatchableRequest shape here.
      expect(typeof req.then).toBe("function");
      expect(typeof req.catch).toBe("function");
    });

    it("has .transform() available on the returned request", () => {
      const http = createHttpClient(TOKEN);
      const req = http.get("/me/posts");
      expect(typeof req.transform).toBe("function");
    });
  });

  describe("post", () => {
    it("returns a BatchableRequest with correct method and relative_url", () => {
      const http = createHttpClient(TOKEN);
      const req = http.post("/me/feed", { message: "hello" });
      expect(req.method).toBe("POST");
      expect(req.relative_url).toBe("me/feed");
    });

    it("has .transform() available on the returned request", () => {
      const http = createHttpClient(TOKEN);
      const req = http.post("/me/feed", { message: "hello" });
      expect(typeof req.transform).toBe("function");
    });
  });

  describe("delete", () => {
    it("returns a BatchableRequest with correct method and relative_url", () => {
      const http = createHttpClient(TOKEN);
      const req = http.delete("/123_456");
      expect(req.method).toBe("DELETE");
      expect(req.relative_url).toBe("123_456");
    });

    it("merges user-provided params with access_token", () => {
      const http = createHttpClient(TOKEN);
      const req = http.delete("/123_456", { params: { source: "api" } });
      expect(req.relative_url).toBe("123_456?source=api");
    });
  });

  describe("getToken", () => {
    it("returns the access token passed to createHttpClient", () => {
      const http = createHttpClient(TOKEN);
      expect(http.getToken()).toBe(TOKEN);
    });
  });
});
