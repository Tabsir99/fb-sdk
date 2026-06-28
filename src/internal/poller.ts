import { type ListMedia } from "../resources/PageResource.js";
import { type GetMedia } from "../resources/PostResource.js";
import { type FacebookMedia } from "../types/facebookmedia.js";
import { type InstagramContainer } from "../types/instagram.js";
import { type BatchableRequest } from "../types/shared.js";
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
  async (listVideos: ListMedia, trackingId: string) => {
    const videos = await listVideos({
      fields: {
        status: true,
        postId: true,
        universalVideoId: true,
      },
      // Without an explicit limit the default page (~25) can miss the tracked
      // upload on busy pages and falsely time out.
      options: { limit: 100 },
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
  async (getReel: GetMedia) => {
    const { postId, status } = await getReel({ postId: true, status: true });
    const error = getProcessingError(status);
    if (error) throw new FacebookUploadError(error, status);
    if (postId) return { postId };
    return undefined;
  },
  { maxAttempts: 30, intervalMs: 10000 },
);

export type GetContainerStatus = (id: string) => BatchableRequest<InstagramContainer>;

// Instagram publishing container poller. Unlike the FB video/reel pollers,
// polling here is the designed happy path (not 504 recovery): a container must
// reach FINISHED before media_publish. Cadence follows Meta's guidance —
// every 5s, up to ~5 minutes — and containers expire after 24h regardless.
export const pollContainerStatus = poll(
  async (getStatus: GetContainerStatus, containerId: string) => {
    const { statusCode, status } = await getStatus(containerId);
    if (statusCode === "ERROR") {
      throw new FacebookUploadError(status ?? "Instagram container failed to process");
    }
    if (statusCode === "EXPIRED") {
      throw new FacebookUploadError("Instagram container expired before it was published");
    }
    if (statusCode === "FINISHED") return { containerId };
    return undefined;
  },
  { maxAttempts: 60, intervalMs: 5000 },
);
