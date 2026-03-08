import { api, HttpClient } from "../httpClient.js";
import {
  PublishReelParams,
  PublishReelResponse,
  PublishVideoParams,
  PublishVideoResponse,
  PublishImageParams,
  PublishImageResponse,
  FacebookMedia,
} from "../types/facebookmedia.js";
import { toGraphFields } from "../internal/utils.js";
import { toSnakeFormData } from "../lib/transformCase.js";
import { pollReelStatus, pollVideoStatus } from "../internal/poller.js";
import { GetNode, ListEdge } from "../types/shared.js";
import { randomUUID } from "crypto";
import FormData from "form-data";
import { FacebookUploadError } from "../internal/error.js";
import { FacebookPost } from "../types/facebookpost.js";
import { createMediaResource } from "./PostResource.js";
import { createPageCommentsResource } from "./comment/PageCommentResouorce.js";

export function createPageResource(http: HttpClient, pageId: string) {
  return {
    videos: createVideosResource(http, pageId),
    reels: createReelsResource(http, pageId),
    images: createImagesResource(http, pageId),
    posts: createPostsResource(http, pageId),
    comments: createPageCommentsResource(http, pageId),
  };
}

export type ListPosts = ListEdge<FacebookPost>;
export type GetPost = GetNode<FacebookPost>;

export const createPostsResource = (http: HttpClient, pageId: string) => {
  const list: ListPosts = async (query) => {
    if (query.options?.limit) query.options.limit = Math.min(query.options.limit, 100);
    return http.get(`/${pageId}/posts`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });
  };

  return {
    list,
  };
};

export type PublishVideo = (data: PublishVideoParams) => Promise<{ postId: string }>;
export type ListMedia = ListEdge<FacebookMedia>;

export function createVideosResource(http: HttpClient, pageId: string) {
  const list: ListMedia = async (fields, limit = 5) => {
    return http.get(`/${pageId}/videos`, {
      params: {
        fields: toGraphFields(fields),
        limit,
      },
    });
  };

  const publish: PublishVideo = async (data) => {
    const { thumbnailUrl, ...apiFields } = data;
    const trackingId = randomUUID();

    const form = toSnakeFormData({
      ...apiFields,
      universalVideoId: trackingId,
      published: true,
    });

    if (thumbnailUrl) {
      const thumb = await api.get(thumbnailUrl, { responseType: "stream" });
      form.append("thumb", thumb.data);
    }

    const res = await http.post<PublishVideoResponse>(`/${pageId}/videos`, form, { safe: true });
    if (res.data.error?.code === 389) throw new FacebookUploadError(JSON.stringify(res.data.error));

    if (res.status === 504) return await pollVideoStatus(list, trackingId);
    return { postId: res.data.id! };
  };

  return {
    list,
    publish,
  };
}

export type StartUploadSession = () => Promise<{
  videoId: string;
  uploadUrl: string;
}>;
export type UploadFile = (uploadUrl: string, fileUrl: string) => Promise<void>;
export type FinishUploadSession = (form: FormData) => Promise<PublishReelResponse>;
export type PublishReel = (data: PublishReelParams) => Promise<{ postId: string }>;

export function createReelsResource(http: HttpClient, pageId: string) {
  const list: ListMedia = async (fields, limit = 5) => {
    return await http.get(`/${pageId}/video_reels`, {
      params: {
        fields: toGraphFields(fields),
        limit,
      },
    });
  };

  const startUploadSession: StartUploadSession = async () => {
    return await http.post(`/${pageId}/video_reels`, null, {
      params: { upload_phase: "START" },
    });
  };

  const uploadFile: UploadFile = async (uploadUrl, fileUrl) => {
    await api.post(uploadUrl, null, {
      headers: { file_url: fileUrl, Authorization: `OAuth ${http.getToken()}` },
    });
  };

  const finishUploadSession: FinishUploadSession = async (form) => {
    return await http.post(`/${pageId}/video_reels`, form);
  };

  const publish: PublishReel = async (data) => {
    const { thumbnailUrl, fileUrl, ...apiFields } = data;

    const { uploadUrl, videoId } = await startUploadSession();
    if (!videoId) throw new Error("Failed to upload post due to upload session creation faliure");

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

    return pollReelStatus(createMediaResource(http, videoId).get);
  };

  return {
    publish,
    list,
  };
}

export type PublishImage = (data: PublishImageParams) => Promise<{ postId: string }>;

export function createImagesResource(http: HttpClient, pageId: string) {
  const publish: PublishImage = async (data) => {
    const form = toSnakeFormData({ ...data, published: true });
    const { postId } = await http.post<PublishImageResponse>(`/${pageId}/photos`, form);
    return { postId };
  };

  return {
    publish,
  };
}
