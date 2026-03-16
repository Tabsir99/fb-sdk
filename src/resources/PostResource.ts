import type { FacebookPost, PostExpiration } from "../types/facebookpost.js";
import { BatchableRequest, GetNode } from "../types/shared.js";
import { toGraphFields } from "../internal/utils.js";
import { FacebookMedia } from "../types/facebookmedia.js";
import { createCommenstResource } from "./comment/CommentResource.js";
import { CreateResourceParams } from "../client.js";
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
    comments: createCommenstResource({ http, id }),
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
