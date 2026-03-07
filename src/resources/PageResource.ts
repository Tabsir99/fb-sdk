import { api, HttpClient } from "../httpClient.js";
import {
  FacebookVideo,
  FacebookReel,
  PublishReelParams,
  PublishReelResponse,
  PublishVideoParams,
  PublishVideoResponse,
  FacebookImage,
  PublishImageParams,
  PublishImageResponse,
} from "../types/facebookmedia.js";
import { toGraphFields } from "../utils.js";
import { toSnakeFormData } from "../lib/transformCase.js";
import { pollReelStatus, pollVideoStatus } from "../internal/poller.js";
import { FeedEdgeOptions, GetNode, ListEdge } from "../types/shared.js";
import { randomUUID } from "crypto";
import FormData from "form-data";
import { FacebookUploadError } from "../internal/error.js";
import { Feed } from "../types/facebookpage.js";
import { FacebookPost } from "../types/facebookpost.js";

export function createPageResource(http: HttpClient, pageId: string) {
  return {
    videos: createVideoResource(http, pageId),
    reels: createReelResource(http, pageId),
    images: createImageResource(http, pageId),
    feed: createFeedResource(http, pageId),
    posts: createPostResource(http, pageId),
  };
}

export type ListFeed = ListEdge<Feed["data"][0], FeedEdgeOptions, 2>;

const createFeedResource = (http: HttpClient, pageId: string) => {
  const list: ListFeed = async (query) => {
    return http.get(`/${pageId}/feed`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });
  };

  return {
    list,
  };
};

export type ListPosts = ListEdge<FacebookPost>;
export type GetPost = GetNode<FacebookPost>;

export const createPostResource = (http: HttpClient, pageId: string) => {
  const get: GetPost = async (postId, fields) => {
    return await http.get(`/${postId}`, {
      params: {
        fields: toGraphFields(fields),
      },
    });
  };

  get("", { comments: { fields: {} } });
  const list: ListPosts = async (query) => {
    return http.get(`/${pageId}/posts`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });
  };

  return {
    list,
    get,
  };
};

export type PublishVideo = (data: PublishVideoParams) => Promise<{ postId: string }>;
export type ListVideos = ListEdge<FacebookVideo>;

export function createVideoResource(http: HttpClient, pageId: string) {
  const list: ListVideos = async (fields, limit = 5) => {
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
export type GetReel = GetNode<FacebookReel>;
export type ListReels = ListEdge<FacebookReel>;

export function createReelResource(http: HttpClient, pageId: string) {
  const list: ListReels = async (fields, limit = 5) => {
    return await http.get(`/${pageId}/video_reels`, {
      params: {
        fields: toGraphFields(fields),
        limit,
      },
    });
  };

  const get: GetReel = async (mediaId, fields) => {
    return await http.get(`/${mediaId}`, {
      params: {
        fields: toGraphFields(fields),
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

    return pollReelStatus(get, videoId);
  };

  return {
    publish,
    list,
    get,
  };
}

export type PublishImage = (data: PublishImageParams) => Promise<{ postId: string }>;
export type ListImages = ListEdge<FacebookImage>;
export type GetImage = GetNode<FacebookImage>;

export function createImageResource(http: HttpClient, pageId: string) {
  const list: ListImages = async (fields, limit = 5) => {
    return await http.get(`/${pageId}/photos`, {
      params: {
        fields: toGraphFields(fields),
        limit,
      },
    });
  };

  const get: GetImage = async (mediaId, fields) => {
    return await http.get(`/${mediaId}`, {
      params: {
        fields: toGraphFields(fields),
      },
    });
  };

  const publish: PublishImage = async (data) => {
    const form = toSnakeFormData({ ...data, published: true });
    const { postId } = await http.post<PublishImageResponse>(`/${pageId}/photos`, form);
    return { postId };
  };

  return {
    publish,
    list,
    get,
  };
}
