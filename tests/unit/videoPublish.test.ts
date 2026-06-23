import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type FormData from "form-data";

// Replace the side-fetch axios instance (thumbnail downloads) with a mock,
// while keeping everything else in the module graph real.
vi.mock("../../src/httpClient.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { createVideosResource } from "../../src/resources/PageResource.js";
import { api } from "../../src/httpClient.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";
import { FacebookUploadError } from "../../src/internal/error.js";
import type { HttpClient } from "../../src/httpClient.js";

const apiGet = api.get as unknown as Mock<(url: string, config?: unknown) => Promise<{ data: Buffer }>>;

function createMockHttp(postResponse: unknown) {
  // Snapshot the form at send time — appends arriving after http.post must not count.
  let sentBuffer: Buffer | undefined;
  const http: HttpClient = {
    get: vi.fn() as unknown as HttpClient["get"],
    post: vi.fn((_path: string, form: FormData) => {
      sentBuffer = form.getBuffer();
      return createBatchableRequest("POST", "x", async () => postResponse);
    }) as unknown as HttpClient["post"],
    delete: vi.fn() as unknown as HttpClient["delete"],
    getToken: () => "token",
  };
  return { http, sentForm: () => sentBuffer?.toString() ?? "" };
}

describe("videos.publish", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("awaits the thumbnail download BEFORE sending the form", async () => {
    // Resolve the thumbnail on a later macrotask to expose fire-and-forget regressions.
    apiGet.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: Buffer.from("thumb-bytes") }), 10),
        ),
    );
    const { http, sentForm } = createMockHttp({ id: "vid-1" });
    const videos = createVideosResource({ http, id: "page1" });

    const result = await videos.publish({
      fileUrl: "https://cdn.example.com/v.mp4",
      thumbnailUrl: "https://cdn.example.com/t.jpg",
    });

    expect(result).toEqual({ postId: "vid-1" });
    expect(apiGet).toHaveBeenCalledWith("https://cdn.example.com/t.jpg", {
      responseType: "stream",
    });

    // The form as http.post received it must already contain the thumbnail.
    expect(sentForm()).toContain('name="thumb"');
    expect(sentForm()).toContain("thumb-bytes");
  });

  it("publishes without a thumbnail when none is given", async () => {
    const { http } = createMockHttp({ id: "vid-2" });
    const videos = createVideosResource({ http, id: "page1" });

    const result = await videos.publish({ fileUrl: "https://cdn.example.com/v.mp4" });

    expect(result).toEqual({ postId: "vid-2" });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("throws FacebookUploadError when the API returns no video id", async () => {
    const { http } = createMockHttp({ error: { code: 100 } });
    const videos = createVideosResource({ http, id: "page1" });

    await expect(
      videos.publish({ fileUrl: "https://cdn.example.com/v.mp4" }),
    ).rejects.toThrow(FacebookUploadError);
  });
});
