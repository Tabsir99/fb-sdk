import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { pollContainerStatus, type GetContainerStatus } from "../../internal/poller.js";
import { FacebookUploadError } from "../../internal/error.js";
import { type BatchableRequest, type ListEdge } from "../../types/shared.js";
import {
  type ContentPublishingLimit,
  type InstagramCarouselItem,
  type InstagramContainer,
  type InstagramMedia,
  type InstagramPublishCarouselParams,
  type InstagramPublishImageParams,
  type InstagramPublishReelParams,
  type InstagramPublishResult,
  type InstagramPublishStoryParams,
} from "../../types/instagram.js";

type ContainerResponse = { id?: string };

export type PublishImage = (params: InstagramPublishImageParams) => Promise<InstagramPublishResult>;
export type PublishReel = (params: InstagramPublishReelParams) => Promise<InstagramPublishResult>;
export type PublishStory = (params: InstagramPublishStoryParams) => Promise<InstagramPublishResult>;
export type PublishCarousel = (
  params: InstagramPublishCarouselParams,
) => Promise<InstagramPublishResult>;
export type GetContentPublishingLimit = () => BatchableRequest<ContentPublishingLimit>;
export type ListInstagramMedia = ListEdge<InstagramMedia>;

// A carousel child is its own container: video children must be tagged VIDEO.
function carouselItemBody(item: InstagramCarouselItem): Record<string, unknown> {
  return "videoUrl" in item
    ? { mediaType: "VIDEO", videoUrl: item.videoUrl, isCarouselItem: true, userTags: item.userTags }
    : { imageUrl: item.imageUrl, isCarouselItem: true, userTags: item.userTags };
}

/**
 * Instagram publishing. Unlike the Facebook pipelines (multipart binary upload),
 * every Instagram post is a container state machine: create a container from a
 * public media URL, poll it until `FINISHED`, then publish it. Multi-step, so
 * these return `Promise<T>` and cannot be embedded in `sdk.batch([...])`.
 */
export function createInstagramMediaResource({ http, id }: CreateResourceParams) {
  // The processing gate before media_publish.
  const getContainerStatus: GetContainerStatus = (containerId) =>
    http.get<InstagramContainer>(`/${containerId}`, {
      params: { fields: "status_code,status" },
    });

  // Step 1 — create a media container; returns the creation_id.
  const createContainer = async (body: Record<string, unknown>): Promise<string> => {
    const { id: containerId } = await http.post<ContainerResponse>(`/${id}/media`, body);
    if (!containerId) throw new FacebookUploadError("Instagram container creation returned no id");
    return containerId;
  };

  // Step 2 — publish a finished container; returns the live media id.
  const publishContainer = async (creationId: string): Promise<InstagramPublishResult> => {
    const { id: mediaId } = await http.post<ContainerResponse>(`/${id}/media_publish`, {
      creationId,
    });
    if (!mediaId) throw new FacebookUploadError("Instagram media publish returned no id");
    return { mediaId };
  };

  // create → poll until FINISHED → publish
  const runPublish = async (body: Record<string, unknown>): Promise<InstagramPublishResult> => {
    const creationId = await createContainer(body);
    await pollContainerStatus(getContainerStatus, creationId);
    return publishContainer(creationId);
  };

  const publishImage: PublishImage = (params) => runPublish({ ...params });

  const publishReel: PublishReel = (params) => runPublish({ ...params, mediaType: "REELS" });

  const publishStory: PublishStory = async (params) => {
    const hasImage = Boolean(params.imageUrl);
    const hasVideo = Boolean(params.videoUrl);
    if (hasImage === hasVideo) {
      throw new FacebookUploadError("publishStory requires exactly one of imageUrl or videoUrl");
    }
    return runPublish({ ...params, mediaType: "STORIES" });
  };

  const publishCarousel: PublishCarousel = async ({ children, ...rest }) => {
    if (children.length < 2 || children.length > 10) {
      throw new FacebookUploadError("An Instagram carousel requires between 2 and 10 items");
    }
    // Child containers are independent — create them in parallel, then join.
    const childIds = await Promise.all(children.map((item) => createContainer(carouselItemBody(item))));
    return runPublish({ ...rest, mediaType: "CAROUSEL", children: childIds });
  };

  // Live publish quota — read it rather than hardcoding (Meta's docs disagree, 50 vs 100/24h).
  const contentPublishingLimit: GetContentPublishingLimit = () =>
    http
      .get<{ data: ContentPublishingLimit[] }>(`/${id}/content_publishing_limit`, {
        params: { fields: "config,quota_usage" },
      })
      // This edge always returns exactly one row.
      .transform((res) => res.data[0]!);

  const list: ListInstagramMedia = (query) =>
    http.get(`/${id}/media`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  return {
    publishImage,
    publishReel,
    publishStory,
    publishCarousel,
    contentPublishingLimit,
    list,
  };
}
