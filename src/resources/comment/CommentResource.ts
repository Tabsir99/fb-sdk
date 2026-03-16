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
  UpdateCommentParams,
  UpdateCommentResponse,
  DeleteCommentResponse,
  LikeCommentResponse,
} from "../../types/facebookpost.js";
import { GetNode } from "../../types/shared.js";
import { CreateResourceParams, Store } from "../../client.js";

export interface PageCommentConfig {
  /** Webhook store for targeted fetching of recently-active posts. */
  store?: Store;
  /** Max posts to scan in on-demand mode (default: 50, max: 100). */
  postsLimit?: number;
}

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

  const { create: reply, list: replies } = createCommenstResource({ http, id });

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
export const createCommenstResource = ({ http, id }: CreateResourceParams) => {
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
