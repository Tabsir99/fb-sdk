import { describe, it, expect, vi } from "vitest";
import { createInstagramMediaNodeResource } from "../../src/resources/instagram/InstagramMediaNodeResource.js";
import { createInstagramCommentResource } from "../../src/resources/instagram/InstagramCommentResource.js";
import { createInstagramResource } from "../../src/resources/instagram/InstagramResource.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";
import type { HttpClient } from "../../src/httpClient.js";

interface Call {
  method: string;
  path: string;
  data?: Record<string, unknown>;
  params?: Record<string, unknown> | undefined;
}

function createMockHttp(handlers: {
  get?: (path: string) => unknown;
  post?: (path: string, data: Record<string, unknown>) => unknown;
  delete?: (path: string) => unknown;
}) {
  const calls: Call[] = [];
  const http: HttpClient = {
    get: vi.fn((path: string, options?: { params?: Record<string, unknown> }) => {
      calls.push({ method: "GET", path, params: options?.params });
      return createBatchableRequest("GET", path, async () => handlers.get?.(path));
    }) as unknown as HttpClient["get"],
    post: vi.fn((path: string, data: Record<string, unknown>) => {
      calls.push({ method: "POST", path, data });
      return createBatchableRequest("POST", path, async () => handlers.post?.(path, data));
    }) as unknown as HttpClient["post"],
    delete: vi.fn((path: string) => {
      calls.push({ method: "DELETE", path });
      return createBatchableRequest("DELETE", path, async () => handlers.delete?.(path));
    }) as unknown as HttpClient["delete"],
    getToken: () => "token",
  };
  return { http, calls };
}

describe("instagram media node", () => {
  it("get reads the media node by id", async () => {
    const { http, calls } = createMockHttp({
      get: () => ({ id: "m", caption: "hi", likeCount: 3 }),
    });
    const media = createInstagramMediaNodeResource({ http, id: "m" });

    const node = await media.get({ id: true, caption: true, likeCount: true });

    expect(node).toEqual({ id: "m", caption: "hi", likeCount: 3 });
    expect(calls[0]!).toMatchObject({ method: "GET", path: "/m" });
  });

  it("setCommentEnabled toggles commenting via comment_enabled", async () => {
    const { http, calls } = createMockHttp({ post: () => ({ success: true }) });
    const media = createInstagramMediaNodeResource({ http, id: "m" });

    const res = await media.setCommentEnabled(false);

    expect(res).toEqual({ success: true });
    expect(calls[0]!).toMatchObject({ method: "POST", path: "/m", data: { commentEnabled: false } });
  });

  it("comments.create posts a message to the media's comments edge", async () => {
    const { http, calls } = createMockHttp({ post: () => ({ id: "c-new" }) });
    const media = createInstagramMediaNodeResource({ http, id: "m" });

    const res = await media.comments.create({ message: "nice!" });

    expect(res).toEqual({ id: "c-new" });
    expect(calls[0]!).toMatchObject({
      method: "POST",
      path: "/m/comments",
      data: { message: "nice!" },
    });
  });
});

describe("instagram comment node", () => {
  it("reply, hide and delete hit the right endpoints", async () => {
    const { http, calls } = createMockHttp({
      post: (path) => (path.endsWith("/replies") ? { id: "r-1" } : { success: true }),
      delete: () => ({ success: true }),
    });
    const comment = createInstagramCommentResource({ http, id: "c" });

    await comment.reply({ message: "thanks" });
    await comment.hide(true);
    await comment.delete();

    expect(calls[0]!).toMatchObject({
      method: "POST",
      path: "/c/replies",
      data: { message: "thanks" },
    });
    expect(calls[1]!).toMatchObject({ method: "POST", path: "/c", data: { hide: true } });
    expect(calls[2]!).toMatchObject({ method: "DELETE", path: "/c" });
  });
});

describe("instagram mentions", () => {
  it("reply posts mediaId/commentId/message to the mentions edge", async () => {
    const { http, calls } = createMockHttp({ post: () => ({ id: "c-reply" }) });
    const ig = createInstagramResource({ http, id: "ig" });

    await ig.mentions.reply({ mediaId: "m", commentId: "c", message: "hey" });

    expect(calls[0]!).toMatchObject({
      method: "POST",
      path: "/ig/mentions",
      data: { mediaId: "m", commentId: "c", message: "hey" },
    });
  });

  it("getComment expands mentioned_comment and unwraps the node", async () => {
    const { http, calls } = createMockHttp({
      get: () => ({ mentionedComment: { id: "c", text: "@me hi" } }),
    });
    const ig = createInstagramResource({ http, id: "ig" });

    const c = await ig.mentions.getComment("c", { id: true, text: true });

    expect(c).toEqual({ id: "c", text: "@me hi" });
    expect(String(calls[0]!.params?.["fields"])).toContain("mentioned_comment.comment_id(c)");
  });
});

describe("instagram account reads", () => {
  it("stories and tags list the account's media edges", async () => {
    const { http, calls } = createMockHttp({ get: () => ({ data: [], paging: {} }) });
    const ig = createInstagramResource({ http, id: "ig" });

    await ig.stories({ fields: { id: true } });
    await ig.tags({ fields: { id: true } });

    expect(calls[0]!).toMatchObject({ method: "GET", path: "/ig/stories" });
    expect(calls[1]!).toMatchObject({ method: "GET", path: "/ig/tags" });
  });
});
