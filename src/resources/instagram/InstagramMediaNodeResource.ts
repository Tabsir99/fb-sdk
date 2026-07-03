import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { type BatchableRequest, type GetNode } from "../../types/shared.js";
import { type InstagramMedia, type InstagramSuccessResult } from "../../types/instagram.js";
import { createInstagramCommentsResource } from "./InstagramCommentResource.js";
import { createInstagramMediaInsightResource } from "./InstagramInsightResource.js";

export type GetInstagramMedia = GetNode<InstagramMedia>;
export type SetInstagramCommentEnabled = (
  enabled: boolean,
) => BatchableRequest<InstagramSuccessResult>;

/**
 * A single published Instagram media node — read its fields, read its insights,
 * and moderate its comments. Keyed by the media id (`sdk.instagramMedia(id)`).
 */
export function createInstagramMediaNodeResource(params: CreateResourceParams) {
  const { http, id } = params;

  const get: GetInstagramMedia = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  // POST /{media-id}?comment_enabled=bool — turn commenting on/off for this media.
  const setCommentEnabled: SetInstagramCommentEnabled = (enabled) =>
    http.post<InstagramSuccessResult>(`/${id}`, { commentEnabled: enabled });

  return {
    get,
    setCommentEnabled,
    comments: createInstagramCommentsResource(params),
    insights: createInstagramMediaInsightResource(params),
  };
}
