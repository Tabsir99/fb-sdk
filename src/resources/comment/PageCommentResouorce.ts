import { fetchComments } from "../../internal/fetchers.js";
import { KeysToCamel, toCamel } from "../../lib/transformCase.js";
import { CommentEdgeOptions, CommentWithPost } from "../../types/facebookpost.js";
import { Collection, Fields, FbFieldSelector, ORDER } from "../../types/shared.js";
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

type PageComment = KeysToCamel<CommentWithPost>;

export type GetPageComments = <F extends FbFieldSelector<PageComment, 2>>(query: {
  fields: Fields<PageComment, F, 2>;
  options?: CommentEdgeOptions;
}) => Promise<Collection<PageComment, F>>;

export function createPageCommentsResource({ http, id, config }: CreateResourceParams) {
  const PostResource = createPostsResource({ http, id });
  const store = config?.store;

  /**
   * Aggregated page-level comments from multiple posts.
   *
   * Not batchable — this is a multi-step aggregation, not a single Graph API call.
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

    const { comments, nextCursors } = await fetchComments(http, {
      postIds,
      query,
      cursors,
    });

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
