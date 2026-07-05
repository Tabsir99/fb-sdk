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

/** Publish a single image post from a public image URL. */
export type PublishImage = (params: InstagramPublishImageParams) => Promise<InstagramPublishResult>;
/** Publish a reel from a public video URL. */
export type PublishReel = (params: InstagramPublishReelParams) => Promise<InstagramPublishResult>;
/** Publish an image or video story. */
export type PublishStory = (params: InstagramPublishStoryParams) => Promise<InstagramPublishResult>;
/** Publish a 2-10 item image/video carousel. */
export type PublishCarousel = (
  params: InstagramPublishCarouselParams,
) => Promise<InstagramPublishResult>;
/** Read the account's rolling 24h publish-quota usage. */
export type GetContentPublishingLimit = () => BatchableRequest<ContentPublishingLimit>;
/** List the account's published media. */
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
  const getContainerStatus: GetContainerStatus = (containerId) =>
    http.get<InstagramContainer>(`/${containerId}`, {
      params: { fields: "status_code,status" },
    });

  const createContainer = async (body: Record<string, unknown>): Promise<string> => {
    const { id: containerId } = await http.post<ContainerResponse>(`/${id}/media`, body);
    if (!containerId) throw new FacebookUploadError("Instagram container creation returned no id");
    return containerId;
  };

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

  /** Publish a single image post from a public image URL. */
  const publishImage: PublishImage = (params) => runPublish({ ...params });

  /** Publish a reel from a public video URL. */
  const publishReel: PublishReel = (params) => runPublish({ ...params, mediaType: "REELS" });

  /** Publish a story; requires exactly one of imageUrl or videoUrl. */
  const publishStory: PublishStory = async (params) => {
    const hasImage = Boolean(params.imageUrl);
    const hasVideo = Boolean(params.videoUrl);
    if (hasImage === hasVideo) {
      throw new FacebookUploadError("publishStory requires exactly one of imageUrl or videoUrl");
    }
    return runPublish({ ...params, mediaType: "STORIES" });
  };

  /** Publish a 2-10 item image/video carousel. */
  const publishCarousel: PublishCarousel = async ({ children, ...rest }) => {
    if (children.length < 2 || children.length > 10) {
      throw new FacebookUploadError("An Instagram carousel requires between 2 and 10 items");
    }
    // Child containers are independent — create them in parallel, then join.
    const childIds = await Promise.all(children.map((item) => createContainer(carouselItemBody(item))));
    return runPublish({ ...rest, mediaType: "CAROUSEL", children: childIds });
  };

  /** Read the account's rolling 24h publish-quota usage and limit. */
  const contentPublishingLimit: GetContentPublishingLimit = () =>
    http
      .get<{ data: ContentPublishingLimit[] }>(`/${id}/content_publishing_limit`, {
        params: { fields: "config,quota_usage" },
      })
      // This edge always returns exactly one row.
      .transform((res) => res.data[0]!);

  /** List this account's published media. */
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
