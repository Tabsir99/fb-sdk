import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { type BatchableRequest, type GetNode } from "../../types/shared.js";
import { type InstagramMedia, type InstagramSuccessResult } from "../../types/instagram.js";
import { createInstagramCommentsResource } from "./InstagramCommentResource.js";
import { createInstagramMediaInsightResource } from "./InstagramInsightResource.js";

/** Read fields off a published media node. */
export type GetInstagramMedia = GetNode<InstagramMedia>;
/** Enable or disable commenting on the media. */
export type SetInstagramCommentEnabled = (
  enabled: boolean,
) => BatchableRequest<InstagramSuccessResult>;

/**
 * A single published Instagram media node — read its fields, read its insights,
 * and moderate its comments. Keyed by the media id (`sdk.instagramMedia(id)`).
 */
export function createInstagramMediaNodeResource(params: CreateResourceParams) {
  const { http, id } = params;

  /** Fetch fields off this media node. */
  const get: GetInstagramMedia = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  /** Enable or disable commenting on this media. */
  const setCommentEnabled: SetInstagramCommentEnabled = (enabled) =>
    http.post<InstagramSuccessResult>(`/${id}`, { commentEnabled: enabled });

  return {
    get,
    setCommentEnabled,
    /** Comments edge — list and create comments on this media. */
    comments: createInstagramCommentsResource(params),
    /** Media-level insights — reach, likes, saves, shares. */
    insights: createInstagramMediaInsightResource(params),
  };
}
