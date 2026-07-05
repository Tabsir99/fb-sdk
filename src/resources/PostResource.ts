import type { FacebookPost, PostExpiration } from "../types/facebookpost.js";
import { type BatchableRequest, type GetNode } from "../types/shared.js";
import { toGraphFields } from "../internal/utils.js";
import { type FacebookMedia } from "../types/facebookmedia.js";
import { createCommentsResource } from "./comment/CommentResource.js";
import { type CreateResourceParams } from "../client.js";
import { createPostInsightResource } from "./InsightResource.js";

/** Sets an expiration on this post; `time` is epoch milliseconds. */
export type Expire = (time: number, type: PostExpiration["type"]) => BatchableRequest<void>;
/** Fetch signature for this post node. */
export type GetPost = GetNode<FacebookPost>;

/** Creates the Post resource: read the post, set its expiration, and access its comments and insights. */
export function createPostResource({ id, http }: CreateResourceParams) {
  /** Sets an expiration on this post; `time` is epoch milliseconds. */
  const expire: Expire = (time, type) =>
    http.post(`/${id}`, {
      expiration: { type, time: Math.ceil(time / 1000) } satisfies PostExpiration,
    });

  /** Fetches this post by field selection. */
  const get: GetPost = (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  return {
    expire,
    get,
    /** Comments on this post: list and create. */
    comments: createCommentsResource({ http, id }),
    /** Insight metrics for this post. */
    insights: createPostInsightResource({ http, id }),
  };
}

/** Fetch signature for a single media (video/reel) node. */
export type GetMedia = GetNode<FacebookMedia>;
/** Creates a media resource for reading a single video/reel node. */
export function createMediaResource({ http, id }: CreateResourceParams) {
  /** Fetches this media node by field selection. */
  const get: GetMedia = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  return { get };
}
/** Type of the {@link createMediaResource} factory. */
export type CreateMediaResource = typeof createMediaResource;
