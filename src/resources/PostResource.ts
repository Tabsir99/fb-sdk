import type { HttpClient } from "../httpClient.js";
import type { FacebookPost, PostExpiration } from "../types/facebookpost.js";
import { GetNode } from "../types/shared.js";
import { toGraphFields } from "../internal/utils.js";
import { FacebookMedia } from "../types/facebookmedia.js";
import { createCommenstResource } from "./CommentResource.js";

export type Expire = (time: number, type: PostExpiration["type"]) => Promise<void>;
export type GetPost = GetNode<FacebookPost>;

export function createPostResource(http: HttpClient, postId: string) {
  const expire: Expire = async (time, type) =>
    http.post(`/${postId}`, {
      expiration: { type, time: Math.ceil(time / 1000) } satisfies PostExpiration,
    });

  const get: GetPost = async (fields) =>
    http.get(`/${postId}`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  return {
    expire,
    get,
    comments: createCommenstResource(http, postId),
  };
}

export type GetMedia = GetNode<FacebookMedia>;
export function createMediaResource(http: HttpClient, mediaId: string) {
  const get: GetMedia = (fields) => {
    return http.get(`/${mediaId}`, { params: toGraphFields(fields) });
  };

  return { get };
}
export type CreateMediaResource = typeof createMediaResource;
