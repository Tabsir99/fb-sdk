import { fetchComments } from "../../internal/fetchers.js";
import { type KeysToCamel } from "../../lib/transformCase.js";
import { type CommentEdgeOptions, type CommentWithPost } from "../../types/facebookpost.js";
import { type Collection, type Fields, type FbFieldSelector, ORDER } from "../../types/shared.js";
import { createPostsResource } from "../PageResource.js";
import { type CreateResourceParams } from "../../client.js";

interface AggregationCursor {
  cursors: Record<string, string>;
}

function encodeCursor(cursor: AggregationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(encoded: string): AggregationCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    const cursors = (parsed as AggregationCursor | null)?.cursors;
    if (!cursors || typeof cursors !== "object") throw new Error("missing cursors");
    return parsed as AggregationCursor;
  } catch {
    throw new Error(`Invalid pagination cursor: "${encoded.slice(0, 24)}..."`);
  }
}

type PageComment = KeysToCamel<CommentWithPost>;

/** Lists comments aggregated across a Page's recent posts as one paginated stream. */
export type GetPageComments = <F extends FbFieldSelector<PageComment>>(query: {
  fields: Fields<PageComment, F>;
  options?: CommentEdgeOptions;
}) => Promise<Collection<PageComment, F>>;

/** Creates the Page comments resource that aggregates comments across the Page's posts. */
export function createPageCommentsResource({ http, id, config }: CreateResourceParams) {
  const PostResource = createPostsResource({ http, id });
  const store = config?.store;
  const postsLimit = Math.min(config?.postsLimit ?? 50, 100);

  /**
   * Lists comments aggregated across the Page's recent posts as one paginated
   * stream via an encoded multi-post cursor; uses the webhook-fed store to target
   * recently-active posts when available. Not batchable — multi-step aggregation.
   */
  const list: GetPageComments = async (query) => {
    const { since, until, after } = query.options ?? {};

    let postIds: string[];
    let cursors: Record<string, string> = {};

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

    const { comments, nextCursors } = await fetchComments(http, {
      postIds,
      query,
      cursors,
    });

    const hasMore = Object.keys(nextCursors).length > 0;
    return {
      data: comments as any,
      paging: {
        cursors: {
          before: "",
          after: hasMore ? encodeCursor({ cursors: nextCursors }) : "",
        },
      },
    };
  };

  return { list };
}
