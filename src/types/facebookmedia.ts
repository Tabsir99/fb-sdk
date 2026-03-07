import { KeysToCamel } from "../lib/transformCase.js";

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
}

export type FacebookMedia = KeysToCamel<MediaRaw>;

interface FacebookVideoRaw extends MediaRaw {
  universal_video_id?: string;
}
export type FacebookVideo = KeysToCamel<FacebookVideoRaw>;

interface FacebookReelRaw extends MediaRaw {}
export type FacebookReel = KeysToCamel<FacebookReelRaw>;

interface FacebookImageRaw extends MediaRaw {}
export type FacebookImage = KeysToCamel<FacebookImageRaw>;

export type PublishVideoResponse =
  | { id: string; error?: undefined }
  | { error: { code: number }; id: undefined };

export type PublishReelResponse =
  | { postId: string; error?: undefined; success: boolean }
  | { error: { code: number }; postId: undefined; success: boolean };

export type PublishImageResponse = { id: string; postId: string };

// ─── Shared API Structures ───

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

// Fields that map directly to the Facebook API
interface VideoUploadParamsRaw {
  title?: string | null;
  description?: string | null;
  custom_labels?: CustomLabelsRaw;
  feed_targeting?: FeedTargetingRaw;
  file_url: string;
}
type VideoUploadParams = KeysToCamel<VideoUploadParamsRaw>;

export interface PublishVideoParams extends VideoUploadParams {
  thumbnailUrl?: string | undefined;
}

export interface PublishReelParams extends VideoUploadParams {
  thumbnailUrl?: string | undefined;
}

interface PublishImageParamsRaw {
  caption?: string | null;
  url: string;
  custom_labels?: CustomLabelsRaw;
  feed_targeting?: FeedTargetingRaw;
}

export type PublishImageParams = KeysToCamel<PublishImageParamsRaw>;
