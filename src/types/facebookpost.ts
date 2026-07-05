import { type KeysToCamel } from "../lib/transformCase.js";
import type { CollectionOf, PictureData, BaseEdgeOptions, ORDER } from "./shared.js";

/** A user/actor reference (id, name, picture) as returned on comments and posts. */
export interface UserRaw {
  id: string;
  name: string;
  picture: { data: PictureData };
}

/** Options for the `comments` edge. */
export interface CommentEdgeOptions extends BaseEdgeOptions {
  /** `toplevel` returns only root comments; `stream` returns all, flattened. */
  filter?: "toplevel" | "stream";
  /** Request the `summary` block (e.g. total count). */
  summary?: boolean;
  order?: ORDER;
}

/** Media or link attached to a comment. */
export interface CommentAttachmentRaw {
  media?: { image?: { src: string; width: number; height: number } };
  url?: string;
  type?: string;
}

/** A comment on a Facebook post, or a reply to another comment. */
export interface CommentRaw {
  id: string;
  message: string;
  created_time: string;
  is_hidden: boolean;
  from: UserRaw;
  like_count: number;
  /** Number of replies to this comment. */
  comment_count: number;
  attachment: CommentAttachmentRaw;
  /** Parent comment; present on replies. */
  parent: { id: string };
  permalink_url: string;
  /** Page admin who authored the comment, when posted as the Page. */
  admin_creator?: { id: string; name: string };
  application?: { id: string; name: string };
  can_comment?: boolean;
  can_hide?: boolean;
  can_like?: boolean;
  can_remove?: boolean;
  can_reply_privately?: boolean;
  is_private?: boolean;
  /** Whether the authenticated user has liked this comment. */
  user_likes?: boolean;
  /** Users/Pages tagged in `message`. */
  message_tags?: CollectionOf<{ id: string; name: string }>;
  object?: { id: string };
  comments: CollectionOf<CommentRaw, CommentEdgeOptions> & {
    summary?: { total_count: number };
  };
}
/** A comment (camelCase view). */
export type Comment = KeysToCamel<CommentRaw>;

/** A comment plus a slim reference to the post it belongs to. */
export interface CommentWithPost extends CommentRaw {
  post?: Pick<FacebookPostRaw, "id" | "message" | "picture">;
}

/** Scheduled expiry for a post. */
export interface PostExpiration {
  /** `expire_only` hides the post; `expire_and_delete` also deletes it. */
  type: "expire_only" | "expire_and_delete";
  /** Unix timestamp when the post expires. */
  time: number;
}

/** A published Facebook Page post. */
export interface FacebookPostRaw {
  id: string;
  /** What created the post, e.g. `added_video` or `added_photos`. */
  status_type: "added_video" | "added_photos";
  created_time: string;
  message?: string;
  picture: string;
  /** Full-size cover image URL (vs the thumbnail `picture`). */
  full_picture: string;
  shares: { count: number };
  reactions: { summary: { total_count: number } };
  comments: CollectionOf<CommentRaw, CommentEdgeOptions> & {
    summary?: { total_count: number };
  };
  attachments?: {
    data: {
      description?: string;
      title?: string;
      target?: { id: string; url: string };
    }[];
  };
}
/** A published Facebook Page post (camelCase view). */
export type FacebookPost = KeysToCamel<FacebookPostRaw>;

interface CreateCommentParamsRaw {
  message?: string;
  attachment_id?: string;
  attachment_share_url?: string;
  attachment_url?: string;
  /** File URL (downloaded to a stream) or Buffer; conversion handled in the resource layer. */
  source?: string;
}
/** Params to create a comment on a post or reply to a comment. */
export type CreateCommentParams = KeysToCamel<CreateCommentParamsRaw> & {
  /** URL to download and stream as the comment's `source` attachment. */
  sourceUrl?: string;
};

/** Result of creating a comment: the new comment id. */
export type CreateCommentResponse = { id: string };

interface UpdateCommentParamsRaw {
  message?: string;
  attachment_id?: string;
  attachment_share_url?: string;
  attachment_url?: string;
  is_hidden?: boolean;
}
/** Params to edit a comment or toggle its hidden state. */
export type UpdateCommentParams = KeysToCamel<UpdateCommentParamsRaw>;

/** `{ success }` result of editing a comment. */
export type UpdateCommentResponse = { success: boolean };
/** `{ success }` result of deleting a comment. */
export type DeleteCommentResponse = { success: boolean };
/** `{ success }` result of liking (or unliking) a comment. */
export type LikeCommentResponse = { success: boolean };
