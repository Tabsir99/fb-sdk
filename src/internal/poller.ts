import { GetReel, ListVideos } from "../resources/PageResource.js";
import { FacebookMedia } from "../types/facebookmedia.js";
import { FacebookUploadError } from "./error.js";

interface PollConfig {
  maxAttempts?: number;
  intervalMs?: number;
}

const getProcessingError = (status: FacebookMedia["status"]) => {
  if (status.videoStatus === "error") return "Video upload failed";

  const phase =
    status.uploadingPhase?.status === "error"
      ? status.uploadingPhase
      : status.processingPhase?.status === "error"
        ? status.processingPhase
        : status.publishingPhase?.status === "error"
          ? status.publishingPhase
          : null;

  return phase?.errors?.[0]?.message;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function poll<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult | undefined>,
  config: PollConfig = {},
) {
  const { maxAttempts = 30, intervalMs = 10000 } = config;

  return async (...args: TArgs): Promise<TResult> => {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await fn(...args);
      if (result !== undefined) return result;
      await sleep(intervalMs);
    }
    throw new Error(
      `Polling timed out after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 60000} min)`,
    );
  };
}

export const pollVideoStatus = poll(
  async (listVideos: ListVideos, trackingId: string) => {
    const videos = await listVideos({
      status: true,
      postId: true,
      universalVideoId: true,
    });
    const target = videos.data.find((v) => v.universalVideoId === trackingId);
    if (!target) return undefined;

    const error = getProcessingError(target.status);
    if (error) throw new FacebookUploadError(error, target.status);

    if (target.status.publishingPhase?.status === "complete") {
      return { postId: target.postId };
    }
    return undefined;
  },
  { maxAttempts: 30, intervalMs: 20000 },
);

export const pollReelStatus = poll(
  async (getReel: GetReel, mediaId: string) => {
    const { postId, status } = await getReel(mediaId, { postId: true, status: true });
    const error = getProcessingError(status);
    if (error) throw new FacebookUploadError(error, status);
    if (postId) return { postId };
    return undefined;
  },
  { maxAttempts: 30, intervalMs: 10000 },
);
