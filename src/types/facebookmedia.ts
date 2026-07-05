import { type KeysToCamel } from "../lib/transformCase.js";

interface MediaStatus {
  video_status: "upload_complete" | "error";
  uploading_phase?: {
    status: "complete" | "error";
    errors: { code: number; message: string }[];
  };
  processing_phase?: {
    status: "complete" | "error";
    errors: { code: number; message: string }[];
  };
  publishing_phase?: {
    status: "complete" | "error";
    errors: { code: number; message: string }[];
    publish_time?: string;
    publish_status?: string;
  };
}

interface MediaRaw {
  id: string;
  post_id: string;
  status: MediaStatus;
  description?: string;
  title?: string;
  permalink_url: string;
  picture?: string;
  full_picture?: string;
  created_time: string;
  length: number;
  views: number;
  universal_video_id?: string;
}

/** A Facebook video media node (camelCase view). */
export type FacebookMedia = KeysToCamel<MediaRaw>;

/** Result of a video publish: `id` on success, or `error.code`. */
export type PublishVideoResponse =
  | { id: string; error?: undefined }
  | { error: { code: number }; id: undefined };

/** Result of a reel publish: `postId` on success, or `error.code`; `success` flags the outcome. */
export type PublishReelResponse =
  | { postId: string; error?: undefined; success: boolean }
  | { error: { code: number }; postId: undefined; success: boolean };

/** Result of a photo publish: the media `id` and its owning `postId`. */
export type PublishImageResponse = { id: string; postId: string };

interface CustomLabelsRaw {
  id: string;
}

enum RelationshipStatus {
  SINGLE = 1,
  IN_RELATIONSHIP = 2,
  MARRIED = 3,
  ENGAGED = 4,
}

enum Genders {
  MALE = 1,
  FEMALE = 2,
}

interface FeedTargetingRaw {
  geo_locations: {
    countries: string[];
    regions: string[];
    cities: string[];
    zips: string[];
  };
  age_min: number;
  age_max: number;
  genders: Genders[];
  college_years: number[];
  education_statuses: number[];
  relationship_statuses: RelationshipStatus[];
  interests: string[];
}

interface VideoUploadParamsRaw {
  title?: string | null;
  description?: string | null;
  custom_labels?: CustomLabelsRaw;
  feed_targeting?: FeedTargetingRaw;
  file_url: string;
}
type VideoUploadParams = KeysToCamel<VideoUploadParamsRaw>;

/** Params to publish a video from a public `fileUrl`. */
export interface PublishVideoParams extends VideoUploadParams {
  /** Public URL of a custom thumbnail image. */
  thumbnailUrl?: string | undefined;
}

/** Params to publish a reel from a public `fileUrl`. */
export interface PublishReelParams extends VideoUploadParams {
  /** Public URL of a custom thumbnail image. */
  thumbnailUrl?: string | undefined;
}

interface PublishImageParamsRaw {
  caption?: string | null;
  url: string;
  custom_labels?: CustomLabelsRaw;
  feed_targeting?: FeedTargetingRaw;
}

/** Params to publish a photo from a public `url`. */
export type PublishImageParams = KeysToCamel<PublishImageParamsRaw>;
