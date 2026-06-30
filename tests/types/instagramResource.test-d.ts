import { expectTypeOf } from "expect-type";
import type { BatchableRequest, Collection } from "../../src/types/shared.js";
import type {
  ContentPublishingLimit,
  InstagramMedia,
  InstagramPublishResult,
} from "../../src/types/instagram.js";
import type {
  PublishImage,
  PublishReel,
  PublishCarousel,
  GetContentPublishingLimit,
  ListInstagramMedia,
} from "../../src/resources/instagram/InstagramMediaResource.js";

// 1. publishImage returns Promise<InstagramPublishResult>
declare const publishImage: PublishImage;
expectTypeOf(publishImage({ imageUrl: "https://x/y.jpg" })).toEqualTypeOf<Promise<InstagramPublishResult>>();

// 2. imageUrl is required
declare const publishImage2: PublishImage;
// @ts-expect-error - imageUrl is required
void publishImage2({});

// 3. publishReel requires videoUrl
declare const publishReel: PublishReel;
expectTypeOf(publishReel({ videoUrl: "https://x/y.mp4" })).toEqualTypeOf<Promise<InstagramPublishResult>>();

// 4. publishCarousel takes a children array of image- or video-items
declare const publishCarousel: PublishCarousel;
expectTypeOf(
  publishCarousel({ children: [{ imageUrl: "a" }, { videoUrl: "b" }] }),
).toEqualTypeOf<Promise<InstagramPublishResult>>();

// 5. contentPublishingLimit returns a batchable request
declare const limit: GetContentPublishingLimit;
expectTypeOf(limit()).toEqualTypeOf<BatchableRequest<ContentPublishingLimit>>();

// 6. list returns BatchableRequest<Collection<InstagramMedia, F>>
declare const list: ListInstagramMedia;
expectTypeOf(list({ fields: { id: true, mediaType: true } })).toEqualTypeOf<
  BatchableRequest<Collection<InstagramMedia, { id: true; mediaType: true }>>
>();

// 7. list rejects unknown fields at the call site
declare const list2: ListInstagramMedia;
// @ts-expect-error - unknownField is not a field of InstagramMedia
list2({ fields: { unknownField: true } });
