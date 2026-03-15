import type { HttpClient } from "../httpClient.js";
import type { CommentWithPost, FacebookPostRaw } from "../types/facebookpost.js";
import { ORDER } from "../types/shared.js";
import type { GetPageComments } from "../resources/comment/PageCommentResouorce.js";
import { toGraphFields } from "./utils.js";
import { createBatchResource } from "../resources/createBatchResource.js";

type GetPageCommentsParams = Parameters<GetPageComments>[0];

type FetchComments = (
  http: HttpClient,
  params: {
    postIds: string[];
    query: GetPageCommentsParams;
    cursors: Record<string, string>;
  },
) => Promise<{
  comments: CommentWithPost[];
  nextCursors: Record<string, string>;
}>;

type PostWithComments = Pick<FacebookPostRaw, "id" | "message" | "picture" | "comments">;

export const fetchComments: FetchComments = async (http, { postIds, query, cursors }) => {
  const batch = createBatchResource(http);

  const allComments: CommentWithPost[] = [];
  const nextCursors: Record<string, string> = {};

  const { successes } = await batch(postIds, (postId) => {
    const {
      fields: { post, ...commentFields },
      options,
    } = query;

    const commentQuery = toGraphFields({
      comments: {
        fields: commentFields,
        options: {
          ...options,
          limit: 1,
          order: options?.order ?? ORDER.NEWEST,
          after: cursors[postId],
        },
      },
    });

    return {
      method: "GET",
      relative_url: `${postId}?fields=id,message,picture,${commentQuery}`,
    };
  });

  for (let i = 0; i < successes.length; i++) {
    const postId = postIds[i]!;

    const { id, message = "", picture, comments } = successes[i]?.data as PostWithComments;

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
