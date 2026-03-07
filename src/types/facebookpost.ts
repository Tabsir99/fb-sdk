import { KeysToCamel } from "../lib/transformCase.js";
import type { CollectionOf, PictureData } from "./shared.js";

export interface UserRaw {
  id: string;
  name: string;
  picture: { data: PictureData };
}

export interface CommentRaw {
  id: string;
  message: string;
  created_time: string;
  is_hidden: boolean;
  from: UserRaw;
  comments: CollectionOf<CommentRaw>;
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
  comments?: CollectionOf<CommentRaw> & {
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
