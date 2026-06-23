import { describe, it, expect, vi } from "vitest";
import { createPageCommentsResource } from "../../src/resources/comment/PageCommentResource.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";
import type { HttpClient } from "../../src/httpClient.js";
import type { BatchSubResponse } from "../../src/types/shared.js";

const PAGE_ID = "page1";

function postBody(postId: string, comments?: object) {
  return JSON.stringify({
    id: postId,
    message: `message of ${postId}`,
    picture: "pic.jpg",
    ...(comments !== undefined && { comments }),
  });
}

const COMMENTS_EDGE = {
  data: [{ id: "c1", message: "hello there" }],
  paging: { next: "https://next", cursors: { before: "", after: "AFTER_1" } },
};

/**
 * Fake http for the aggregation flow:
 * - GET /{page}/posts resolves the post list (the only GET that ever executes).
 * - Other GETs build per-post requests that must ONLY run through batch —
 *   their executors throw if invoked directly.
 * - POST / (the batch call) resolves the given sub-responses.
 */
function createMockHttp(postIds: string[], subResponses: BatchSubResponse[]) {
  const getCalls: { path: string; params: Record<string, unknown> }[] = [];
  const http: HttpClient = {
    get: vi.fn((path: string, options?: { params?: Record<string, unknown> }) => {
      getCalls.push({ path, params: options?.params ?? {} });
      if (path === `/${PAGE_ID}/posts`) {
        return createBatchableRequest("GET", "posts", async () => ({
          data: postIds.map((id) => ({ id })),
          paging: { cursors: { before: "", after: "" } },
        }));
      }
      return createBatchableRequest("GET", path.slice(1), async () => {
        throw new Error("per-post request must go through batch, not direct execution");
      });
    }) as unknown as HttpClient["get"],
    post: vi.fn(() => createBatchableRequest("POST", "/", async () => subResponses)),
    delete: vi.fn() as unknown as HttpClient["delete"],
    getToken: () => "token",
  } as HttpClient;
  return { http, getCalls };
}

const FIELDS = {
  id: true,
  message: true,
  post: { id: true, message: true, picture: true },
} as const;

describe("page comments aggregation", () => {
  it("aggregates comments across posts and attaches the post snippet", async () => {
    const { http } = createMockHttp(
      ["p1"],
      [{ code: 200, body: postBody("p1", COMMENTS_EDGE) }],
    );
    const comments = createPageCommentsResource({ http, id: PAGE_ID });

    const result = await comments.list({ fields: FIELDS });

    expect(result.data).toEqual([
      {
        id: "c1",
        message: "hello there",
        post: { id: "p1", message: "message of p1", picture: "pic.jpg" },
      },
    ]);
  });

  describe("postsLimit", () => {
    it.each([
      [undefined, 50],
      [80, 80],
      [150, 100],
    ])("config postsLimit %s scans %s posts", async (postsLimit, expected) => {
      const { http, getCalls } = createMockHttp(
        ["p1"],
        [{ code: 200, body: postBody("p1", COMMENTS_EDGE) }],
      );
      const comments = createPageCommentsResource({
        http,
        id: PAGE_ID,
        ...(postsLimit !== undefined && { config: { postsLimit } }),
      });

      await comments.list({ fields: FIELDS });

      expect(getCalls[0]!.path).toBe(`/${PAGE_ID}/posts`);
      expect(getCalls[0]!.params["limit"]).toBe(expected);
    });
  });

  it("skips posts whose comments edge is missing instead of crashing", async () => {
    const { http } = createMockHttp(
      ["p1", "p2"],
      [
        { code: 200, body: postBody("p1") }, // no comments edge at all
        { code: 200, body: postBody("p2", COMMENTS_EDGE) },
      ],
    );
    const comments = createPageCommentsResource({ http, id: PAGE_ID });

    const result = await comments.list({ fields: FIELDS });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.post?.id).toBe("p2");
  });

  describe("pagination cursor", () => {
    it("returns an encoded cursor when posts have more pages, empty when they don't", async () => {
      const withMore = await (async () => {
        const { http } = createMockHttp(
          ["p1"],
          [{ code: 200, body: postBody("p1", COMMENTS_EDGE) }],
        );
        return createPageCommentsResource({ http, id: PAGE_ID }).list({ fields: FIELDS });
      })();
      expect(withMore.paging.cursors.after).not.toBe("");
      const decoded = JSON.parse(
        Buffer.from(withMore.paging.cursors.after, "base64url").toString("utf-8"),
      );
      expect(decoded).toEqual({ cursors: { p1: "AFTER_1" } });

      const noMore = await (async () => {
        const edge = { ...COMMENTS_EDGE, paging: { cursors: { before: "", after: "" } } };
        const { http } = createMockHttp(["p1"], [{ code: 200, body: postBody("p1", edge) }]);
        return createPageCommentsResource({ http, id: PAGE_ID }).list({ fields: FIELDS });
      })();
      expect(noMore.paging.cursors.after).toBe("");
    });

    it("resumes from a cursor without re-listing posts", async () => {
      const { http, getCalls } = createMockHttp(
        [],
        [{ code: 200, body: postBody("p1", COMMENTS_EDGE) }],
      );
      const comments = createPageCommentsResource({ http, id: PAGE_ID });
      const after = Buffer.from(JSON.stringify({ cursors: { p1: "RESUME_ME" } })).toString(
        "base64url",
      );

      const result = await comments.list({ fields: FIELDS, options: { after } });

      expect(result.data).toHaveLength(1);
      // No posts listing — only the per-post comment request was built
      expect(getCalls.every((c) => c.path !== `/${PAGE_ID}/posts`)).toBe(true);
      // The resumed cursor is embedded in the per-post fields string
      expect(getCalls[0]!.params["fields"]).toContain("after(RESUME_ME)");
    });

    it("rejects malformed cursors with a clear error", async () => {
      const { http } = createMockHttp([], []);
      const comments = createPageCommentsResource({ http, id: PAGE_ID });

      await expect(
        comments.list({ fields: FIELDS, options: { after: "!!!not-a-cursor!!!" } }),
      ).rejects.toThrow("Invalid pagination cursor");
    });
  });

  it("returns an empty collection when the page has no posts", async () => {
    const { http } = createMockHttp([], []);
    const comments = createPageCommentsResource({ http, id: PAGE_ID });

    const result = await comments.list({ fields: FIELDS });

    expect(result).toEqual({ data: [], paging: { cursors: { before: "", after: "" } } });
  });
});
