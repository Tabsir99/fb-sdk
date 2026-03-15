import { fetchComments } from "../../internal/fetchers.js";
import { KeysToCamel, toCamel } from "../../lib/transformCase.js";
import { CommentEdgeOptions, CommentWithPost } from "../../types/facebookpost.js";
import { ListEdge, ORDER } from "../../types/shared.js";
import { createPostsResource } from "../PageResource.js";
import { CreateResourceParams } from "../../client.js";

// ─── Cursor Encoding ───
interface AggregationCursor {
  cursors: Record<string, string>;
}

function encodeCursor(cursor: AggregationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(encoded: string): AggregationCursor {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as AggregationCursor;
}

export type GetPageComments = ListEdge<KeysToCamel<CommentWithPost>, CommentEdgeOptions, 2>;

export function createPageCommentsResource({ http, id, config }: CreateResourceParams) {
  const PostResource = createPostsResource({ http, id });
  const store = config?.store;
  /**
   * Aggregated page-level comments from multiple posts.
   *
   * On-demand mode (no store): fetches recent posts from feed, then comments from each.
   * Webhook-assisted mode (store provided): fetches comments only from posts with known activity.
   */
  const list: GetPageComments = async (query) => {
    const { since, until, after } = query.options ?? {};

    let postIds: string[];
    let cursors: Record<string, string> = {};

    // Resume from cursor if provided
    if (after) {
      const decoded = decodeCursor(after);
      cursors = decoded.cursors;
      postIds = Object.keys(decoded.cursors);
    } else if (store && since) {
      postIds = await store.getActivePosts(id, since);
    } else {
      const posts = await PostResource.list({
        fields: { id: true },
        options: {
          limit: 50,
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

    // Fetch comments from all posts using batch requests
    const { comments, nextCursors } = await fetchComments(http, {
      postIds,
      query,
      cursors,
    });

    // The http client already applies toCamel on GET responses,
    // but batch responses come as raw strings — we need to transform

    const camelData = comments.map(toCamel);

    return {
      data: camelData as any,
      paging: {
        cursors: {
          before: "",
          after: encodeCursor({ cursors: nextCursors }),
        },
      },
    };
  };

  return { list };
}
