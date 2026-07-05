import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { type BatchableRequest, type GetNode, type ListEdge } from "../../types/shared.js";
import {
  type InstagramComment,
  type InstagramCommentParams,
  type InstagramCommentResult,
  type InstagramSuccessResult,
} from "../../types/instagram.js";

/** Read fields off a single comment node. */
export type GetInstagramComment = GetNode<InstagramComment>;
/** List comments on a media, or replies on a comment. */
export type ListInstagramComments = ListEdge<InstagramComment>;
/** Create a top-level comment or a reply. */
export type CreateInstagramComment = (
  params: InstagramCommentParams,
) => BatchableRequest<InstagramCommentResult>;
/** Hide or unhide a comment. */
export type HideInstagramComment = (hidden: boolean) => BatchableRequest<InstagramSuccessResult>;
/** Delete a comment. */
export type DeleteInstagramComment = () => BatchableRequest<InstagramSuccessResult>;

/**
 * The comments edge of a media node (`/{media-id}/comments`) — or, when keyed by
 * a comment id, the replies edge of that comment (`/{comment-id}/replies`).
 */
export const createInstagramCommentsResource = ({ http, id }: CreateResourceParams) => {
  /** List comments on this media node. */
  const list: ListInstagramComments = (query) =>
    http.get(`/${id}/comments`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  /** Post a top-level comment on this media. */
  const create: CreateInstagramComment = (params) =>
    http.post<InstagramCommentResult>(`/${id}/comments`, params);

  return { list, create };
};

/** Operations on a single Instagram comment. Note: IG has no comment-like API. */
export function createInstagramCommentResource({ http, id }: CreateResourceParams) {
  /** Fetch fields off this comment node. */
  const get: GetInstagramComment = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  /** Reply to this comment. */
  const reply: CreateInstagramComment = (params) =>
    http.post<InstagramCommentResult>(`/${id}/replies`, params);

  /** List replies to this comment. */
  const replies: ListInstagramComments = (query) =>
    http.get(`/${id}/replies`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  /** Hide or unhide this comment. */
  const hide: HideInstagramComment = (hidden) =>
    http.post<InstagramSuccessResult>(`/${id}`, { hide: hidden });

  /** Delete this comment. */
  const remove: DeleteInstagramComment = () => http.delete<InstagramSuccessResult>(`/${id}`);

  return { get, reply, replies, hide, delete: remove };
}
