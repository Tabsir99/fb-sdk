import type { HttpClient } from "../httpClient.js";
import type { CommentWithPost } from "../types/facebookpost.js";
import { ORDER } from "../types/shared.js";
import type { GetPageComments } from "../resources/comment/PageCommentResouorce.js";
import { createBatchResource } from "../resources/createBatchResource.js";
import { createPostResource } from "../resources/PostResource.js";
import { KeysToCamel } from "../lib/transformCase.js";

type GetPageCommentsParams = Parameters<GetPageComments>[0];

type FetchComments = (
  http: HttpClient,
  params: {
    postIds: string[];
    query: GetPageCommentsParams;
    cursors: Record<string, string>;
  },
) => Promise<{
  comments: KeysToCamel<CommentWithPost>[];
  nextCursors: Record<string, string>;
}>;

export const fetchComments: FetchComments = async (http, { postIds, query, cursors }) => {
  const batch = createBatchResource(http);

  const allComments: KeysToCamel<CommentWithPost>[] = [];
  const nextCursors: Record<string, string> = {};

  const {
    fields: { post, ...commentFields },
    options,
  } = query;

  const results = await batch(
    postIds.map((postId) =>
      createPostResource({ http, id: postId }).get({
        id: true,
        message: true,
        picture: true,
        comments: {
          fields: commentFields,
          options: {
            ...options,
            order: options?.order ?? ORDER.NEWEST,
            ...(cursors[postId] && { after: cursors[postId] }),
          },
        },
      }),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const postId = postIds[i]!;

    const result = results[i];
    if (result?.status !== 200) continue;

    const { id, message = "", picture, comments } = result.data;

    for (const comment of comments.data) {
      allComments.push({
        ...comment,
        post: { id, message, picture },
      });
    }

    if (comments.paging?.next && comments.paging.cursors?.after) {
      nextCursors[postId] = comments.paging.cursors.after;
    }
  }

  return { comments: allComments, nextCursors };
};
