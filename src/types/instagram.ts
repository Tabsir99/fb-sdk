import { type KeysToCamel } from "../lib/transformCase.js";
import { type CollectionOf } from "./shared.js";

// ─── Read model ──────────────────────────────────────────────────────────────

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

// ─── Publishing: container status ────────────────────────────────────────────

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

// ─── Publishing: quota ───────────────────────────────────────────────────────

interface ContentPublishingLimitRaw {
  quota_usage: number;
  config: {
    quota_total: number;
    quota_duration: number;
  };
}

/** Rolling publish-quota usage from `/{ig-user-id}/content_publishing_limit`. */
export type ContentPublishingLimit = KeysToCamel<ContentPublishingLimitRaw>;

// ─── Publishing: params ──────────────────────────────────────────────────────
// Prefixed `Instagram*` because Facebook's publish params (PublishImageParams,
// PublishReelParams, …) share the same root names and are also publicly exported.

/** A person tag. Coordinates apply to image media; reels/video accept just `username`. */
export interface InstagramUserTag {
  username: string;
  x?: number;
  y?: number;
}

export interface InstagramProductTag {
  productId: string;
  x?: number;
  y?: number;
}

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

export type InstagramCarouselItem =
  | { imageUrl: string; userTags?: InstagramUserTag[] }
  | { videoUrl: string; userTags?: InstagramUserTag[] };

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
