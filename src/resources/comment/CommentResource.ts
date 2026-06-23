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

// ─── Single Comment Operations ───

export type GetComment = GetNode<Comment>;

export type UpdateComment = (data: UpdateCommentParams) => BatchableRequest<UpdateCommentResponse>;
export type DeleteComment = () => BatchableRequest<DeleteCommentResponse>;
export type LikeComment = () => BatchableRequest<LikeCommentResponse>;
export type UnlikeComment = () => BatchableRequest<LikeCommentResponse>;

export function createCommentResource({ http, id }: CreateResourceParams) {
  const get: GetComment = (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  const update: UpdateComment = (data) => {
    return http.post<UpdateCommentResponse>(`/${id}`, data);
  };

  const remove: DeleteComment = () => {
    return http.delete<DeleteCommentResponse>(`/${id}`);
  };

  const like: LikeComment = () => {
    return http.post<LikeCommentResponse>(`/${id}/likes`, null);
  };

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

export type GetComments = ListEdge<Comment, CommentEdgeOptions>;
export type CreateComment = (data: CreateCommentParams) => Promise<CreateCommentResponse>;

/**
 * ObjectId can be a post or comment Id
 */
export const createCommentsResource = ({ http, id }: CreateResourceParams) => {
  const list: GetComments = (query) =>
    http.get(`/${id}/comments`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

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
