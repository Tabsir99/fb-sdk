import type { HttpClient } from "../httpClient.js";
import type { Comment } from "../types/facebookpost.js";
import type { CommentEdgeOptions, ListEdge } from "../types/shared.js";
import { ORDER } from "../types/shared.js";
import type { CommentStore } from "../store/types.js";
import { toGraphFields } from "../internal/utils.js";
import { createPageResource } from "./PageResource.js";
import { toCamel } from "../lib/transformCase.js";
import { fetchComments } from "../internal/fetchers.js";

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
  const list: GetPageComments = async (query, config = {}) => {
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

  return { list };
}
