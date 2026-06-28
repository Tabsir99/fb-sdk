import { describe, it, expect, vi } from "vitest";
import { createInstagramMediaResource } from "../../src/resources/instagram/InstagramMediaResource.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";
import { FacebookUploadError } from "../../src/internal/error.js";
import type { HttpClient } from "../../src/httpClient.js";

interface Call {
  method: string;
  path: string;
  data?: Record<string, unknown>;
}

function createMockHttp(opts: {
  post: (path: string, data: Record<string, unknown>) => unknown;
  get?: (path: string) => unknown;
}) {
  const calls: Call[] = [];
  const http: HttpClient = {
    get: vi.fn((path: string) => {
      calls.push({ method: "GET", path });
      return createBatchableRequest("GET", path, async () => opts.get?.(path));
    }) as unknown as HttpClient["get"],
    post: vi.fn((path: string, data: Record<string, unknown>) => {
      calls.push({ method: "POST", path, data });
      return createBatchableRequest("POST", path, async () => opts.post(path, data));
    }) as unknown as HttpClient["post"],
    delete: vi.fn() as unknown as HttpClient["delete"],
    getToken: () => "token",
  };
  return { http, calls };
}

describe("instagram media publishing", () => {
  it("publishImage: create container → poll FINISHED → publish", async () => {
    const { http, calls } = createMockHttp({
      get: () => ({ statusCode: "FINISHED" }),
      post: (path) => (path.endsWith("/media_publish") ? { id: "media-1" } : { id: "container-1" }),
    });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    const result = await media.publishImage({
      imageUrl: "https://cdn.example.com/p.jpg",
      caption: "hello",
    });

    expect(result).toEqual({ mediaId: "media-1" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /ig1/media",
      "GET /container-1",
      "POST /ig1/media_publish",
    ]);
    // Image containers carry no media_type (IMAGE is the default).
    expect(calls[0]!).toMatchObject({
      data: { imageUrl: "https://cdn.example.com/p.jpg", caption: "hello" },
    });
    expect(calls[0]!.data).not.toHaveProperty("mediaType");
    expect(calls[2]!.data).toEqual({ creationId: "container-1" });
  });

  it("publishReel: tags the container as REELS", async () => {
    const { http, calls } = createMockHttp({
      get: () => ({ statusCode: "FINISHED" }),
      post: (path) => (path.endsWith("/media_publish") ? { id: "reel-media" } : { id: "c-reel" }),
    });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    const result = await media.publishReel({ videoUrl: "https://cdn.example.com/r.mp4", caption: "r" });

    expect(result).toEqual({ mediaId: "reel-media" });
    expect(calls[0]!).toMatchObject({
      path: "/ig1/media",
      data: { mediaType: "REELS", videoUrl: "https://cdn.example.com/r.mp4" },
    });
  });

  it("publishImage: keeps polling while IN_PROGRESS", async () => {
    vi.useFakeTimers();
    try {
      let statusCalls = 0;
      const { http } = createMockHttp({
        get: () => {
          statusCalls += 1;
          return { statusCode: statusCalls < 2 ? "IN_PROGRESS" : "FINISHED" };
        },
        post: (path) => (path.endsWith("/media_publish") ? { id: "m" } : { id: "c" }),
      });
      const media = createInstagramMediaResource({ http, id: "ig1" });

      const promise = media.publishImage({ imageUrl: "https://x/y.jpg" });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ mediaId: "m" });
      expect(statusCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishImage: rejects with FacebookUploadError when the container errors", async () => {
    const { http } = createMockHttp({
      get: () => ({ statusCode: "ERROR", status: "2207026" }),
      post: (path) => (path.endsWith("/media_publish") ? { id: "m" } : { id: "c" }),
    });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    await expect(media.publishImage({ imageUrl: "https://x/y.jpg" })).rejects.toThrow(
      FacebookUploadError,
    );
  });

  it("publishCarousel: creates a child container per item, then a CAROUSEL parent", async () => {
    let child = 0;
    const { http, calls } = createMockHttp({
      get: () => ({ statusCode: "FINISHED" }),
      post: (path, data) => {
        if (path.endsWith("/media_publish")) return { id: "carousel-media" };
        if (data["mediaType"] === "CAROUSEL") return { id: "parent" };
        child += 1;
        return { id: `child-${child}` };
      },
    });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    const result = await media.publishCarousel({
      caption: "album",
      children: [{ imageUrl: "https://x/1.jpg" }, { videoUrl: "https://x/2.mp4" }],
    });

    expect(result).toEqual({ mediaId: "carousel-media" });
    // child 1 (image), child 2 (video), parent (CAROUSEL), poll, publish
    expect(calls[0]!).toMatchObject({
      path: "/ig1/media",
      data: { imageUrl: "https://x/1.jpg", isCarouselItem: true },
    });
    expect(calls[1]!).toMatchObject({
      path: "/ig1/media",
      data: { mediaType: "VIDEO", videoUrl: "https://x/2.mp4", isCarouselItem: true },
    });
    expect(calls[2]!).toMatchObject({
      path: "/ig1/media",
      data: { mediaType: "CAROUSEL", children: ["child-1", "child-2"] },
    });
    expect(calls[4]!).toMatchObject({ path: "/ig1/media_publish", data: { creationId: "parent" } });
  });

  it("publishCarousel: rejects fewer than 2 items before any request", async () => {
    const { http, calls } = createMockHttp({ post: () => ({ id: "x" }) });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    await expect(
      media.publishCarousel({ children: [{ imageUrl: "https://x/1.jpg" }] }),
    ).rejects.toThrow(FacebookUploadError);
    expect(calls).toHaveLength(0);
  });

  it("publishStory: requires exactly one of imageUrl/videoUrl", async () => {
    const { http } = createMockHttp({ post: () => ({ id: "x" }) });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    await expect(media.publishStory({})).rejects.toThrow(FacebookUploadError);
    await expect(
      media.publishStory({ imageUrl: "https://x/1.jpg", videoUrl: "https://x/2.mp4" }),
    ).rejects.toThrow(FacebookUploadError);
  });

  it("contentPublishingLimit: unwraps the single data row", async () => {
    const { http, calls } = createMockHttp({
      post: () => ({}),
      get: () => ({ data: [{ quotaUsage: 2, config: { quotaTotal: 50, quotaDuration: 86400 } }] }),
    });
    const media = createInstagramMediaResource({ http, id: "ig1" });

    const limit = await media.contentPublishingLimit();

    expect(limit).toEqual({ quotaUsage: 2, config: { quotaTotal: 50, quotaDuration: 86400 } });
    expect(calls[0]!).toMatchObject({ method: "GET", path: "/ig1/content_publishing_limit" });
  });
});
