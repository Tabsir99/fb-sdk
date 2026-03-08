import { KeysToCamel } from "../lib/transformCase.js";
import type { CollectionOf, CommentEdgeOptions, PictureData } from "./shared.js";

export interface UserRaw {
  id: string;
  name: string;
  picture: { data: PictureData };
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
  comments: CollectionOf<CommentRaw, CommentEdgeOptions> & {
    summary: { total_count: number };
  };
}
export type Comment = KeysToCamel<CommentRaw>;

export interface PostExpiration {
  type: "expire_only" | "expire_and_delete";
  time: number;
}

export interface FacebookPostRaw {
  id: string;
  status_type: "added_video" | "added_photos";
  created_time?: string;
  message?: string;
  picture?: string;
  full_picture?: string;
  shares?: { count: number };
  reactions?: { summary: { total_count: number } };
  comments?: CollectionOf<CommentRaw, CommentEdgeOptions> & {
    summary: { total_count: number };
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
