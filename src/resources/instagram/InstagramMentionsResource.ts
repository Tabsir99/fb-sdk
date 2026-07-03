import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import {
  type BatchableRequest,
  type FbFieldSelector,
  type FbPickDeep,
  type Fields,
} from "../../types/shared.js";
import {
  type InstagramComment,
  type InstagramCommentResult,
  type InstagramMedia,
  type InstagramMentionReplyParams,
} from "../../types/instagram.js";

export type ReplyInstagramMention = (
  params: InstagramMentionReplyParams,
) => BatchableRequest<InstagramCommentResult>;

/**
 * @-mentions of the account, keyed by the IG-User id. A business can only read a
 * mentioning comment/media through its own user node (parameterized field
 * expansion), and replies via `POST /{ig-user-id}/mentions`.
 */
export function createInstagramMentionsResource({ http, id }: CreateResourceParams) {
  // Provide commentId to reply to a comment-mention; omit it for a caption-mention.
  const reply: ReplyInstagramMention = ({ mediaId, commentId, message }) =>
    http.post<InstagramCommentResult>(`/${id}/mentions`, { mediaId, commentId, message });

  const getComment = <F extends FbFieldSelector<InstagramComment>>(
    commentId: string,
    fields: Fields<InstagramComment, F>,
  ): BatchableRequest<FbPickDeep<InstagramComment, F>> =>
    http
      .get<{ mentionedComment: FbPickDeep<InstagramComment, F> }>(`/${id}`, {
        params: { fields: `mentioned_comment.comment_id(${commentId}){${toGraphFields(fields)}}` },
      })
      .transform((res) => res.mentionedComment);

  const getMedia = <F extends FbFieldSelector<InstagramMedia>>(
    mediaId: string,
    fields: Fields<InstagramMedia, F>,
  ): BatchableRequest<FbPickDeep<InstagramMedia, F>> =>
    http
      .get<{ mentionedMedia: FbPickDeep<InstagramMedia, F> }>(`/${id}`, {
        params: { fields: `mentioned_media.media_id(${mediaId}){${toGraphFields(fields)}}` },
      })
      .transform((res) => res.mentionedMedia);

  return { reply, getComment, getMedia };
}
