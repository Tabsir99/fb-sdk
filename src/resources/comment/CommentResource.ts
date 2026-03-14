import { api } from "../../httpClient.js";
import type {
  Comment,
  CommentEdgeOptions,
  CreateCommentParams,
  CreateCommentResponse,
} from "../../types/facebookpost.js";
import type { ListEdge } from "../../types/shared.js";
import { toGraphFields } from "../../internal/utils.js";
import { toSnakeFormData } from "../../lib/transformCase.js";
import {
  UpdateCommentParams,
  UpdateCommentResponse,
  DeleteCommentResponse,
  LikeCommentResponse,
} from "../../types/facebookpost.js";
import { GetNode } from "../../types/shared.js";
import { FacebookUploadError } from "../../internal/error.js";
import { CreateResourceParams, Store } from "../../client.js";

export interface PageCommentConfig {
  /** Webhook store for targeted fetching of recently-active posts. */
  store?: Store;
  /** Max posts to scan in on-demand mode (default: 50, max: 100). */
  postsLimit?: number;
}

// ─── Single Comment Operations ───

export type GetComment = GetNode<Comment>;

export type UpdateComment = (data: UpdateCommentParams) => Promise<UpdateCommentResponse>;

export type DeleteComment = () => Promise<DeleteCommentResponse>;
export type LikeComment = () => Promise<LikeCommentResponse>;
export type UnlikeComment = () => Promise<LikeCommentResponse>;

export function createCommentResource({ http, id }: CreateResourceParams) {
  const get: GetComment = async (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  const update: UpdateComment = async (data) => {
    return http.post<UpdateCommentResponse>(`/${id}`, data);
  };

  const remove: DeleteComment = async () => {
    return http.delete<DeleteCommentResponse>(`/${id}`);
  };

  const like: LikeComment = async () => {
    return http.post<LikeCommentResponse>(`/${id}/likes`, null);
  };

  const unlike: UnlikeComment = async () => {
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
  const list: GetComments = async (fields) =>
    http.get(`/${id}/comments`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  const create: CreateComment = async (data) => {
    const { sourceUrl, ...apiFields } = data;
    const form = toSnakeFormData(apiFields);

    if (sourceUrl) {
      const source = await api.get(sourceUrl, { responseType: "stream" });
      form.append("source", source.data);
    }

    const res = await http.post<CreateCommentResponse>(`/${id}/comments`, form, {
      safe: true,
    });

    // Similar to page publish operations, if there's an error shape we throw it
    if ((res.data as any).error) {
      throw new FacebookUploadError(JSON.stringify((res.data as any).error));
    }

    return res.data;
  };

  return {
    list,
    create,
  };
};
