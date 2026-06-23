import type { FacebookPost, PostExpiration } from "../types/facebookpost.js";
import { type BatchableRequest, type GetNode } from "../types/shared.js";
import { toGraphFields } from "../internal/utils.js";
import { type FacebookMedia } from "../types/facebookmedia.js";
import { createCommentsResource } from "./comment/CommentResource.js";
import { type CreateResourceParams } from "../client.js";
import { createPostInsightResource } from "./InsightResource.js";

export type Expire = (time: number, type: PostExpiration["type"]) => BatchableRequest<void>;
export type GetPost = GetNode<FacebookPost>;

export function createPostResource({ id, http }: CreateResourceParams) {
  const expire: Expire = (time, type) =>
    http.post(`/${id}`, {
      expiration: { type, time: Math.ceil(time / 1000) } satisfies PostExpiration,
    });

  const get: GetPost = (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  return {
    expire,
    get,
    comments: createCommentsResource({ http, id }),
    insights: createPostInsightResource({ http, id }),
  };
}

export type GetMedia = GetNode<FacebookMedia>;
export function createMediaResource({ http, id }: CreateResourceParams) {
  const get: GetMedia = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  return { get };
}
export type CreateMediaResource = typeof createMediaResource;
