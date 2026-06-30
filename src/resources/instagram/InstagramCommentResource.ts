import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { type BatchableRequest, type GetNode, type ListEdge } from "../../types/shared.js";
import {
  type InstagramComment,
  type InstagramCommentParams,
  type InstagramCommentResult,
  type InstagramSuccessResult,
} from "../../types/instagram.js";

export type GetInstagramComment = GetNode<InstagramComment>;
export type ListInstagramComments = ListEdge<InstagramComment>;
export type CreateInstagramComment = (
  params: InstagramCommentParams,
) => BatchableRequest<InstagramCommentResult>;
export type HideInstagramComment = (hidden: boolean) => BatchableRequest<InstagramSuccessResult>;
export type DeleteInstagramComment = () => BatchableRequest<InstagramSuccessResult>;

/**
 * The comments edge of a media node (`/{media-id}/comments`) — or, when keyed by
 * a comment id, the replies edge of that comment (`/{comment-id}/replies`).
 */
export const createInstagramCommentsResource = ({ http, id }: CreateResourceParams) => {
  const list: ListInstagramComments = (query) =>
    http.get(`/${id}/comments`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  const create: CreateInstagramComment = (params) =>
    http.post<InstagramCommentResult>(`/${id}/comments`, params);

  return { list, create };
};

/** Operations on a single Instagram comment. Note: IG has no comment-like API. */
export function createInstagramCommentResource({ http, id }: CreateResourceParams) {
  const get: GetInstagramComment = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  const reply: CreateInstagramComment = (params) =>
    http.post<InstagramCommentResult>(`/${id}/replies`, params);

  const replies: ListInstagramComments = (query) =>
    http.get(`/${id}/replies`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  // POST /{comment-id}?hide=bool — hide (true) or unhide (false) the comment.
  const hide: HideInstagramComment = (hidden) =>
    http.post<InstagramSuccessResult>(`/${id}`, { hide: hidden });

  const remove: DeleteInstagramComment = () => http.delete<InstagramSuccessResult>(`/${id}`);

  return { get, reply, replies, hide, delete: remove };
}
