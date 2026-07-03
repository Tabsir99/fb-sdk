import { expectTypeOf } from "expect-type";
import type { BatchableRequest, Collection, FbPickDeep } from "../../src/types/shared.js";
import type { HttpClient } from "../../src/httpClient.js";
import type { InstagramComment, InstagramMedia, InstagramUser } from "../../src/types/instagram.js";
import type {
  InstagramInsightResponse,
  InstagramInsightResult,
  InstagramMediaInsightMetrics,
} from "../../src/types/instagraminsights.js";
import type {
  GetInstagramAccount,
  ListInstagramStories,
} from "../../src/resources/instagram/InstagramResource.js";
import type { GetInstagramMedia } from "../../src/resources/instagram/InstagramMediaNodeResource.js";
import type {
  GetInstagramComment,
  ListInstagramComments,
} from "../../src/resources/instagram/InstagramCommentResource.js";
import { createInstagramMediaInsightResource } from "../../src/resources/instagram/InstagramInsightResource.js";

// 1. account get returns the picked InstagramUser shape
declare const getAccount: GetInstagramAccount;
expectTypeOf(getAccount({ id: true, username: true, followersCount: true })).toEqualTypeOf<
  BatchableRequest<FbPickDeep<InstagramUser, { id: true; username: true; followersCount: true }>>
>();

// 2. account get rejects unknown fields
declare const getAccount2: GetInstagramAccount;
// @ts-expect-error - notAField is not on InstagramUser
getAccount2({ notAField: true });

// 3. media node get returns the picked InstagramMedia shape
declare const getMedia: GetInstagramMedia;
expectTypeOf(getMedia({ id: true, caption: true })).toEqualTypeOf<
  BatchableRequest<FbPickDeep<InstagramMedia, { id: true; caption: true }>>
>();

// 4. comment get returns the picked InstagramComment shape
declare const getComment: GetInstagramComment;
expectTypeOf(getComment({ id: true, text: true })).toEqualTypeOf<
  BatchableRequest<FbPickDeep<InstagramComment, { id: true; text: true }>>
>();

// 5. comments list returns a collection of comments
declare const listComments: ListInstagramComments;
expectTypeOf(listComments({ fields: { id: true, text: true } })).toEqualTypeOf<
  BatchableRequest<Collection<InstagramComment, { id: true; text: true }>>
>();

// 6. stories list returns a collection of media
declare const stories: ListInstagramStories;
expectTypeOf(stories({ fields: { id: true, mediaType: true } })).toEqualTypeOf<
  BatchableRequest<Collection<InstagramMedia, { id: true; mediaType: true }>>
>();

// 7. media insights: each selected metric maps to InstagramInsightResult
type MediaInsights = InstagramInsightResponse<
  InstagramMediaInsightMetrics,
  { reach: true; views: true }
>;
expectTypeOf<MediaInsights>().toEqualTypeOf<{
  reach: InstagramInsightResult;
  views: InstagramInsightResult;
}>();

// 8. insights.list rejects unknown metrics and returns the mapped response
declare const http: HttpClient;
const mediaInsights = createInstagramMediaInsightResource({ http, id: "m" });
// @ts-expect-error - notAMetric is not a media insight metric
mediaInsights.list({ fields: { notAMetric: true } });
expectTypeOf(mediaInsights.list({ fields: { reach: true } })).toEqualTypeOf<
  BatchableRequest<{ reach: InstagramInsightResult }>
>();
