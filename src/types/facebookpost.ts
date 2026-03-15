import { KeysToCamel } from "../lib/transformCase.js";
import type { CollectionOf, PictureData, BaseEdgeOptions, ORDER } from "./shared.js";

export interface UserRaw {
  id: string;
  name: string;
  picture: { data: PictureData };
}

export interface CommentEdgeOptions extends BaseEdgeOptions {
  filter?: "toplevel" | "stream";
  summary?: boolean;
  order?: ORDER;
}

export interface CommentAttachmentRaw {
  media?: { image?: { src: string; width: number; height: number } };
  url?: string;
  type?: string;
}

export interface CommentRaw {
  id: string;
  message: string;
  created_time: string;
  is_hidden: boolean;
  from: UserRaw;
  like_count: number;
  comment_count: number;
  attachment: CommentAttachmentRaw;
  parent: { id: string };
  permalink_url: string;
  admin_creator?: { id: string; name: string };
  application?: { id: string; name: string };
  can_comment?: boolean;
  can_hide?: boolean;
  can_like?: boolean;
  can_remove?: boolean;
  can_reply_privately?: boolean;
  is_private?: boolean;
  user_likes?: boolean;
  message_tags?: CollectionOf<{ id: string; name: string }>;
  object?: { id: string };
  comments: CollectionOf<CommentRaw, CommentEdgeOptions> & {
    summary?: { total_count: number };
  };
}
export type Comment = KeysToCamel<CommentRaw>;

export interface CommentWithPost extends CommentRaw {
  post?: Pick<FacebookPostRaw, "id" | "message" | "picture">;
}

export interface PostExpiration {
  type: "expire_only" | "expire_and_delete";
  time: number;
}

export interface FacebookPostRaw {
  id: string;
  status_type: "added_video" | "added_photos";
  created_time: string;
  message?: string;
  picture: string;
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
export type FacebookPost = KeysToCamel<FacebookPostRaw>;

// ─── Write Operations ───

interface CreateCommentParamsRaw {
  message?: string;
  attachment_id?: string;
  attachment_share_url?: string;
  attachment_url?: string;
  source?: string; // This expects a file url to be converted to stream, or Buffer, but we handle the actual conversion in resource.
}
export type CreateCommentParams = KeysToCamel<CreateCommentParamsRaw> & {
  sourceUrl?: string; // helper for passing a URL that we will download and stream as `source`
};

export type CreateCommentResponse = { id: string };

interface UpdateCommentParamsRaw {
  message?: string;
  attachment_id?: string;
  attachment_share_url?: string;
  attachment_url?: string;
  is_hidden?: boolean;
}
export type UpdateCommentParams = KeysToCamel<UpdateCommentParamsRaw>;

export type UpdateCommentResponse = { success: boolean };
export type DeleteCommentResponse = { success: boolean };
export type LikeCommentResponse = { success: boolean };
