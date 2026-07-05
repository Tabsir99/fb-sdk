import { api } from "../httpClient.js";
import {
  type PublishReelParams,
  type PublishReelResponse,
  type PublishVideoParams,
  type PublishVideoResponse,
  type PublishImageParams,
  type PublishImageResponse,
  type FacebookMedia,
} from "../types/facebookmedia.js";
import { toGraphFields } from "../internal/utils.js";
import { toSnakeFormData } from "../lib/transformCase.js";
import { pollReelStatus, pollVideoStatus } from "../internal/poller.js";
import { type GetNode, type ListEdge } from "../types/shared.js";
import { randomUUID } from "crypto";
import type FormData from "form-data";
import { FacebookUploadError } from "../internal/error.js";
import { type FacebookPost } from "../types/facebookpost.js";
import { createMediaResource } from "./PostResource.js";
import { createPageCommentsResource } from "./comment/PageCommentResource.js";
import { createPageInsightResource } from "./InsightResource.js";
import { type CreateResourceParams } from "../client.js";
import { isAxiosError } from "axios";

/** Creates the Page resource hub: videos, reels, images (photos), post feed, comments, and insights. */
export function createPageResource(params: CreateResourceParams) {
  return {
    /** Videos on the Page: list and publish. */
    videos: createVideosResource(params),
    /** Reels on the Page: list and publish. */
    reels: createReelsResource(params),
    /** Photos on the Page: publish. */
    images: createImagesResource(params),
    /** The Page's post feed: list. */
    posts: createPostsResource(params),
    /** Comments aggregated across the Page's posts. */
    comments: createPageCommentsResource(params),
    /** Page-level insight metrics. */
    insights: createPageInsightResource(params),
  };
}

/** Query signature for listing a Page's post feed. */
export type ListPosts = ListEdge<FacebookPost>;
/** Fetch signature for a single post node. */
export type GetPost = GetNode<FacebookPost>;

/** Creates the Page's post-feed resource. */
export const createPostsResource = ({ http, id }: CreateResourceParams) => {
  /** Lists posts on the Page's feed; `limit` is capped at 100. */
  const list: ListPosts = (query) => {
    if (query.options?.limit) query.options.limit = Math.min(query.options.limit, 100);
    return http.get(`/${id}/posts`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });
  };

  return {
    list,
  };
};

/** Publishes a video to the Page; resolves with the new post id. */
export type PublishVideo = (data: PublishVideoParams) => Promise<{ postId: string }>;
/** Query signature for listing a Page's media (videos/reels). */
export type ListMedia = ListEdge<FacebookMedia>;

/** Creates the Page videos resource: list and publish videos. */
export function createVideosResource({ http, id }: CreateResourceParams) {
  /** Lists videos on the Page. */
  const list: ListMedia = (query) =>
    http.get(`/${id}/videos`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  /** Publishes a video to the Page; resolves with the new post id. */
  const publish: PublishVideo = async (data) => {
    const trackingId = randomUUID();
    try {
      const { thumbnailUrl, ...apiFields } = data;

      const form = toSnakeFormData({
        ...apiFields,
        universalVideoId: trackingId,
        published: true,
      });

      if (thumbnailUrl) {
        const thumb = await api.get(thumbnailUrl, { responseType: "stream" });
        form.append("thumb", thumb.data);
      }

      const res = await http.post<PublishVideoResponse>(`/${id}/videos`, form);
      if (res.error || !res.id) {
        throw new FacebookUploadError(
          res.error ? JSON.stringify(res.error) : "Video publish returned no id",
        );
      }
      return { postId: res.id };
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        const { data, status } = error.response;
        if (data.error?.code === 389) throw new FacebookUploadError(JSON.stringify(data.error));
        if (status === 504) return await pollVideoStatus(list, trackingId);
      }
      throw error;
    }
  };

  return {
    list,
    publish,
  };
}

/** Starts a resumable reel upload session; returns the video id and upload URL. */
export type StartUploadSession = () => Promise<{
  videoId: string;
  uploadUrl: string;
}>;
/** Uploads reel bytes to the session's upload URL from a remote file URL. */
export type UploadFile = (uploadUrl: string, fileUrl: string) => Promise<void>;
/** Finalizes a reel upload session. */
export type FinishUploadSession = (form: FormData) => Promise<PublishReelResponse>;
/** Publishes a reel to the Page; resolves with the new post id. */
export type PublishReel = (data: PublishReelParams) => Promise<{ postId: string }>;

/** Creates the Page reels resource: list and publish reels. */
export function createReelsResource({ http, id }: CreateResourceParams) {
  /** Lists reels on the Page. */
  const list: ListMedia = (query) =>
    http.get(`/${id}/video_reels`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  const startUploadSession: StartUploadSession = async () => {
    return await http.post(`/${id}/video_reels`, null, {
      params: { upload_phase: "START" },
    });
  };

  const uploadFile: UploadFile = async (uploadUrl, fileUrl) => {
    await api.post(uploadUrl, null, {
      headers: { file_url: fileUrl, Authorization: `OAuth ${http.getToken()}` },
    });
  };

  const finishUploadSession: FinishUploadSession = async (form) => {
    return await http.post(`/${id}/video_reels`, form);
  };

  /** Publishes a reel to the Page via a resumable upload session; resolves with the new post id. */
  const publish: PublishReel = async (data) => {
    const { thumbnailUrl, fileUrl, ...apiFields } = data;

    const { uploadUrl, videoId } = await startUploadSession();
    if (!videoId) throw new Error("Failed to upload post due to upload session creation failure");

    await uploadFile(uploadUrl, fileUrl);

    const form = toSnakeFormData({
      ...apiFields,
      videoId,
      uploadPhase: "FINISH",
      videoState: "PUBLISHED",
    });

    if (thumbnailUrl) {
      const thumb = await api.get(thumbnailUrl, { responseType: "stream" });
      form.append("thumb", thumb.data);
    }

    const { error } = await finishUploadSession(form);
    if (error) throw new FacebookUploadError(JSON.stringify(error));

    return pollReelStatus(createMediaResource({ http, id: videoId }).get);
  };

  return {
    publish,
    list,
  };
}

/** Publishes a photo to the Page; resolves with the new post id. */
export type PublishImage = (data: PublishImageParams) => Promise<{ postId: string }>;

/** Creates the Page images resource: publish photos. */
export function createImagesResource({ http, id }: CreateResourceParams) {
  /** Publishes a photo to the Page; resolves with the new post id. */
  const publish: PublishImage = async (data) => {
    const form = toSnakeFormData({ ...data, published: true });
    const { postId } = await http.post<PublishImageResponse>(`/${id}/photos`, form);
    return { postId };
  };

  return {
    publish,
  };
}
