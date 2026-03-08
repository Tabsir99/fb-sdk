import type { HttpClient } from "../httpClient.js";
import type { Comment, CommentRaw } from "../types/facebookpost.js";
import { ORDER, type CommentEdgeOptions, type ListEdge, type Paging } from "../types/shared.js";
import type { CommentStore } from "../store/types.js";
import { toGraphFields } from "../utils.js";
import { createPageResource } from "./PageResource.js";
import { toCamel } from "../lib/transformCase.js";

export interface PageCommentConfig {
  /** Webhook store for targeted fetching of recently-active posts. */
  store?: CommentStore;
  /** Max posts to scan in on-demand mode (default: 50, max: 100). */
  postsLimit?: number;
}

// ─── Cursor Encoding ───

interface AggregationCursor {
  postIds: string[];
  cursors: Record<string, string>;
  since?: number | undefined;
  until?: number | undefined;
  remaining: string[];
}

function encodeCursor(cursor: AggregationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(encoded: string): AggregationCursor {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as AggregationCursor;
}

// ─── Batch Fetching ───

interface BatchSubRequest {
  method: string;
  relative_url: string;
}

interface BatchSubResponse {
  code: number;
  body: string;
}

type FetchComments = (
  http: HttpClient,
  params: {
    postIds: string[];
    fieldsStr: string;
    options: CommentEdgeOptions | undefined;
    cursors: Record<string, string>;
  },
) => Promise<{
  comments: (CommentRaw & { _postId: string })[];
  nextCursors: Record<string, string>;
  remaining: string[];
}>;

const fetchComments: FetchComments = async (http, { postIds, fieldsStr, options, cursors }) => {
  const allComments: (CommentRaw & { _postId: string })[] = [];
  const nextCursors: Record<string, string> = {};
  const remaining: string[] = [];

  // Build batch sub-requests (max 50 per batch)
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 50) {
    chunks.push(postIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const batch: BatchSubRequest[] = chunk.map((postId) => {
      const params = new URLSearchParams();
      params.set("fields", fieldsStr);

      if (options?.filter) params.set("filter", options.filter);
      if (options?.summary !== undefined) params.set("summary", String(options.summary));
      if (options?.since) params.set("since", String(options.since));
      if (options?.until) params.set("until", String(options.until));
      if (options?.order) params.set("order", options.order);

      const cursor = cursors[postId];
      if (cursor) params.set("after", cursor);

      return {
        method: "GET",
        relative_url: `${postId}/comments?${params.toString()}`,
      };
    });

    const responses = await http.post<BatchSubResponse[]>("", {
      batch: JSON.stringify(batch),
      include_headers: "false",
    });

    const responseArray = Array.isArray(responses) ? responses : [];

    for (let i = 0; i < responseArray.length; i++) {
      const resp = responseArray[i];
      const postId = chunk[i]!;
      if (!resp || resp.code !== 200) continue;

      const parsed = JSON.parse(resp.body) as {
        data: CommentRaw[];
        paging?: Paging;
      };

      for (const comment of parsed.data) {
        allComments.push({ ...comment, _postId: postId });
      }

      if (parsed.paging?.next && parsed.paging.cursors?.after) {
        nextCursors[postId] = parsed.paging.cursors.after;
        remaining.push(postId);
      }
    }
  }

  return { comments: allComments, nextCursors, remaining };
};

// ─── Resource Factory ───

export type GetPageComments = ListEdge<Comment, CommentEdgeOptions, 1, PageCommentConfig>;

export function createCommentResource(http: HttpClient, pageId: string) {
  const pages = createPageResource(http, pageId);
  /**
   * Aggregated page-level comments from multiple posts.
   *
   * On-demand mode (no store): fetches recent posts from feed, then comments from each.
   * Webhook-assisted mode (store provided): fetches comments only from posts with known activity.
   */
  const get: GetPageComments = async (query, config = {}) => {
    const { store, postsLimit = 50 } = config;
    const { since, until, after, limit = 300 } = query.options ?? {};

    let postIds: string[];
    let cursors: Record<string, string> = {};

    // Resume from cursor if provided
    if (after) {
      const decoded = decodeCursor(after);
      postIds = decoded.remaining.length > 0 ? decoded.remaining : decoded.postIds;
      cursors = decoded.cursors;
    } else if (store && since) {
      postIds = await store.getActivePosts(pageId, since);
    } else {
      const posts = await pages.posts.list({
        fields: { id: true },
        options: {
          limit: postsLimit,
          ...(since && { since }),
          ...(until && { until }),
          order: ORDER.NEWEST,
        },
      });
      postIds = posts.data.map((p) => p.id);
    }

    if (postIds.length === 0) {
      return {
        data: [],
        paging: { cursors: { before: "", after: "" } },
      };
    }

    // Build the fields string for comments, excluding page-level options
    query.fields.createdTime = true;
    const fieldsStr = toGraphFields(query.fields);

    // Fetch comments from all posts using batch requests
    const result = await fetchComments(http, {
      postIds,
      fieldsStr,
      options: query.options,
      cursors,
    });

    const sliced = result.comments.slice(0, limit);
    const hasMore = result.comments.length > limit || result.remaining.length > 0;

    const afterCursor = hasMore
      ? encodeCursor({
          postIds,
          cursors: result.nextCursors,
          since,
          until,
          remaining: result.remaining,
        })
      : "";

    // Strip _postId and transform via http response pipeline
    // The http client already applies toCamel on GET responses,
    // but batch responses come as raw strings — we need to transform

    const camelData = sliced.map((c) => {
      const { _postId, ...rest } = c;
      void _postId;
      return toCamel(rest);
    });

    return {
      data: camelData as any,
      paging: {
        cursors: {
          before: "",
          after: afterCursor,
        },
      },
    };
  };

  return { get };
}
