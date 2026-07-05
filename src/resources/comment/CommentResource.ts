import { api } from "../../httpClient.js";
import type {
  Comment,
  CommentEdgeOptions,
  CreateCommentParams,
  CreateCommentResponse,
} from "../../types/facebookpost.js";
import type { BatchableRequest, ListEdge } from "../../types/shared.js";
import { toGraphFields } from "../../internal/utils.js";
import { toSnakeFormData } from "../../lib/transformCase.js";
import {
  type UpdateCommentParams,
  type UpdateCommentResponse,
  type DeleteCommentResponse,
  type LikeCommentResponse,
} from "../../types/facebookpost.js";
import { type GetNode } from "../../types/shared.js";
import { type CreateResourceParams, type FbSdkConfig } from "../../client.js";

/** @deprecated Same shape as FbSdkConfig — pass these options to createFbSdk() directly. */
export type PageCommentConfig = FbSdkConfig;

/** Fetch signature for this comment node. */
export type GetComment = GetNode<Comment>;

/** Updates this comment (message, attachment, or hidden state). */
export type UpdateComment = (data: UpdateCommentParams) => BatchableRequest<UpdateCommentResponse>;
/** Deletes this comment. */
export type DeleteComment = () => BatchableRequest<DeleteCommentResponse>;
/** Likes this comment as the Page. */
export type LikeComment = () => BatchableRequest<LikeCommentResponse>;
/** Removes the Page's like from this comment. */
export type UnlikeComment = () => BatchableRequest<LikeCommentResponse>;

/** Creates the single-comment resource: read, edit, delete, like/unlike, and reply. */
export function createCommentResource({ http, id }: CreateResourceParams) {
  /** Fetches this comment by field selection. */
  const get: GetComment = (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  /** Updates this comment (message, attachment, or hidden state). */
  const update: UpdateComment = (data) => {
    return http.post<UpdateCommentResponse>(`/${id}`, data);
  };

  /** Deletes this comment. */
  const remove: DeleteComment = () => {
    return http.delete<DeleteCommentResponse>(`/${id}`);
  };

  /** Likes this comment as the Page. */
  const like: LikeComment = () => {
    return http.post<LikeCommentResponse>(`/${id}/likes`, null);
  };

  /** Removes the Page's like from this comment. */
  const unlike: UnlikeComment = () => {
    return http.delete<LikeCommentResponse>(`/${id}/likes`);
  };

  const { create: reply, list: replies } = createCommentsResource({ http, id });

  return {
    get,
    update,
    delete: remove,
    like,
    unlike,
    reply,
    replies,
  };
}

/** Lists comments on this object (a post or a comment). */
export type GetComments = ListEdge<Comment, CommentEdgeOptions>;
/** Creates a comment on this object; resolves with the new comment id. */
export type CreateComment = (data: CreateCommentParams) => Promise<CreateCommentResponse>;

/** Creates the comments resource for an object — the `id` may be a post or a comment. */
export const createCommentsResource = ({ http, id }: CreateResourceParams) => {
  /** Lists comments on this object (post or comment). */
  const list: GetComments = (query) =>
    http.get(`/${id}/comments`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  /** Creates a comment (or reply) on this object; resolves with the new comment id. */
  const create: CreateComment = async (data) => {
    const { sourceUrl, ...apiFields } = data;
    const form = toSnakeFormData(apiFields);

    if (sourceUrl) {
      const source = await api.get(sourceUrl, { responseType: "stream" });
      form.append("source", source.data);
    }

    return await http.post<CreateCommentResponse>(`/${id}/comments`, form);
  };

  return {
    list,
    create,
  };
};
