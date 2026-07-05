import { type KeysToCamel } from "../lib/transformCase.js";
import { type CollectionOf } from "./shared.js";

/** Value of a media node's `media_type` field. A reel reports `VIDEO` here. */
export type InstagramMediaTypeRead = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
/** Distinguishes a reel (`REELS`) from a plain feed video — both report media_type `VIDEO`. */
export type InstagramMediaProductType = "AD" | "FEED" | "STORY" | "REELS";

interface InstagramMediaChildRaw {
  id: string;
  media_type: InstagramMediaTypeRead;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

interface InstagramMediaRaw {
  id: string;
  media_type: InstagramMediaTypeRead;
  media_product_type: InstagramMediaProductType;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
  timestamp: string;
  username: string;
  shortcode?: string;
  like_count?: number;
  comments_count?: number;
  is_comment_enabled?: boolean;
  is_shared_to_feed?: boolean;
  children?: CollectionOf<InstagramMediaChildRaw>;
}

/** A published Instagram media node (camelCase view). */
export type InstagramMedia = KeysToCamel<InstagramMediaRaw>;

/** Lifecycle status of a publishing container. */
export type ContainerStatusCode =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

interface InstagramContainerRaw {
  id: string;
  status_code: ContainerStatusCode;
  /** Detail string; carries the error subcode when status_code is `ERROR`. */
  status?: string;
}

/** A media-publishing container node, polled until status_code is `FINISHED`. */
export type InstagramContainer = KeysToCamel<InstagramContainerRaw>;

interface ContentPublishingLimitRaw {
  quota_usage: number;
  config: {
    quota_total: number;
    quota_duration: number;
  };
}

/** Rolling publish-quota usage from `/{ig-user-id}/content_publishing_limit`. */
export type ContentPublishingLimit = KeysToCamel<ContentPublishingLimitRaw>;

// `Instagram*` prefix avoids clashing with the exported Facebook publish params.

/** A person tag. Coordinates apply to image media; reels/video accept just `username`. */
export interface InstagramUserTag {
  username: string;
  x?: number;
  y?: number;
}

/** A product tag for shopping-enabled media. */
export interface InstagramProductTag {
  productId: string;
  x?: number;
  y?: number;
}

/** Params to publish a single image. */
export interface InstagramPublishImageParams {
  /** Publicly reachable image URL — Meta fetches it server-side (no binary upload). */
  imageUrl: string;
  caption?: string;
  locationId?: string;
  userTags?: InstagramUserTag[];
  productTags?: InstagramProductTag[];
  altText?: string;
  collaborators?: string[];
  shareToFacebook?: boolean;
}

/** Params to publish a reel. */
export interface InstagramPublishReelParams {
  /** Publicly reachable video URL — Meta fetches it server-side (no binary upload). */
  videoUrl: string;
  caption?: string;
  /** Public URL of a custom cover image. */
  coverUrl?: string;
  /** Milliseconds into the video for the cover frame (ignored when coverUrl is set). */
  thumbOffset?: number;
  /** Also show the reel in the main feed grid (Instagram defaults this to true). */
  shareToFeed?: boolean;
  locationId?: string;
  userTags?: InstagramUserTag[];
  collaborators?: string[];
  audioName?: string;
  shareToFacebook?: boolean;
}

/** Exactly one of imageUrl / videoUrl must be set. */
export interface InstagramPublishStoryParams {
  imageUrl?: string;
  videoUrl?: string;
}

/** One carousel child: an image or a video, each with optional user tags. */
export type InstagramCarouselItem =
  | { imageUrl: string; userTags?: InstagramUserTag[] }
  | { videoUrl: string; userTags?: InstagramUserTag[] };

/** Params to publish a carousel of images/videos. */
export interface InstagramPublishCarouselParams {
  /** Between 2 and 10 items. Reels and stories cannot be carousel items. */
  children: InstagramCarouselItem[];
  caption?: string;
  locationId?: string;
  collaborators?: string[];
  shareToFacebook?: boolean;
}

/** Result of a successful publish: the live media id. */
export interface InstagramPublishResult {
  mediaId: string;
}

interface InstagramUserRaw {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

/** An Instagram professional account node (camelCase view) from `GET /{ig-user-id}`. */
export type InstagramUser = KeysToCamel<InstagramUserRaw>;

interface InstagramCommentAuthorRaw {
  id: string;
  username: string;
}

interface InstagramCommentRaw {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  like_count?: number;
  hidden?: boolean;
  from?: InstagramCommentAuthorRaw;
  parent_id?: string;
  media?: { id: string; media_product_type?: InstagramMediaProductType };
  replies?: CollectionOf<InstagramCommentRaw>;
}

/** An Instagram comment node (camelCase view). Note: IG has no comment-like API. */
export type InstagramComment = KeysToCamel<InstagramCommentRaw>;

/** Body for creating a top-level comment or a reply — IG accepts only `message`. */
export type InstagramCommentParams = { message: string };

/** Result of creating a comment or reply: the new comment id. */
export interface InstagramCommentResult {
  id: string;
}

/** Result of a moderation toggle (hide/unhide, enable/disable comments). */
export interface InstagramSuccessResult {
  success: boolean;
}

/**
 * Reply to an @-mention. Provide `commentId` to reply to a comment the account
 * was mentioned in; omit it to reply on a media caption-mention.
 */
export interface InstagramMentionReplyParams {
  mediaId: string;
  message: string;
  commentId?: string;
}
