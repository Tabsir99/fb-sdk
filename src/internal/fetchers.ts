import FormData from "form-data";
import type { HttpClient } from "../httpClient.js";
import type { CommentWithPost, FacebookPostRaw } from "../types/facebookpost.js";
import { type BatchSubRequest, type BatchSubResponse, ORDER } from "../types/shared.js";
import type { GetPageComments } from "../resources/comment/PageCommentResouorce.js";
import { toGraphFields } from "./utils.js";

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

export const fetchComments: FetchComments = async (http, { postIds, query, cursors }) => {
  const allComments: CommentWithPost[] = [];
  const nextCursors: Record<string, string> = {};

  postIds = [postIds[0]!];
  // Build batch sub-requests (max 50 per batch)
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 50) {
    chunks.push(postIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const batch: BatchSubRequest[] = chunk.map((postId) => {
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

    const form = new FormData();
    form.append("batch", JSON.stringify(batch));
    form.append("include_headers", "false");
    const responses = await http.post<BatchSubResponse[]>("/", form);

    const responseArray = Array.isArray(responses) ? responses : [];

    for (let i = 0; i < responseArray.length; i++) {
      const resp = responseArray[i];
      if (!resp || resp.code !== 200) continue;

      const postId = chunk[i]!;

      const {
        id,
        message = "",
        picture,
        comments,
      } = JSON.parse(resp.body) as Pick<FacebookPostRaw, "id" | "message" | "picture" | "comments">;

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
  }

  return { comments: allComments, nextCursors };
};
