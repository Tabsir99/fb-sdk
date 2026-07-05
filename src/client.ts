import { createHttpClient, type HttpClient } from "./httpClient.js";
import { createPostResource } from "./resources/PostResource.js";
import { createPageResource } from "./resources/PageResource.js";
import { createUserResource } from "./resources/UserResource.js";
import { createCommentResource } from "./resources/comment/CommentResource.js";
import type { Store } from "./store/types.js";
import { createBatchResource } from "./resources/createBatchResource.js";
import type { FacebookErrorHook } from "./internal/error.js";

/** Configuration for {@link createFbSdk}. */
export interface FbSdkConfig {
  /** Webhook-fed store enabling targeted comment fetching of recently-active posts. */
  store?: Store;
  /** Max posts to scan per page in on-demand comment aggregation (default: 50, max: 100). */
  postsLimit?: number;
  /**
   * Invoked after a response is received but before it is returned/thrown,
   * whenever an error is detected — on direct requests and on individual batch
   * sub-responses. Receives a strictly-typed `FacebookError` (narrow on
   * `.category`, with a `.raw` escape hatch) and a context object identifying
   * the failing call (`method`, `relativeUrl`, `accessToken`, `source`).
   * Observational: it never changes what the SDK throws/returns.
   */
  onError?: FacebookErrorHook;
}

/** Inputs shared by the resource factories: http client, node id, and config. */
export interface CreateResourceParams {
  http: HttpClient;
  id: string;
  config?: FbSdkConfig;
}

/**
 * Create the Facebook Graph API SDK. Returns a factory that takes an access
 * token and yields a token-scoped client.
 *
 * @example
 * const client = createFbSdk()("PAGE_ACCESS_TOKEN");
 * const post = await client.post("POST_ID").get({ message: true });
 */
export function createFbSdk(config: FbSdkConfig = {}) {
  return (accessToken: string) => {
    const http = createHttpClient(accessToken, { onError: config.onError });
    return {
      /** Operate on a single post node by id. */
      post: (postId: string) => createPostResource({ http, id: postId, config }),
      /** Operate on a Page node by id. */
      page: (pageId: string) => createPageResource({ http, id: pageId, config }),
      /** Operate on a single comment node by id. */
      comment: (commentId: string) => createCommentResource({ http, id: commentId, config }),
      /** The token owner's user node (`me`). */
      me: createUserResource({ http, config, id: "me" }),
      /** Escape hatch: the raw Graph http client. */
      http,
      /** Combine batchable requests into a single Graph API batch call. */
      batch: createBatchResource(http, { onError: config.onError }),
    };
  };
}

export { createInstagramSdk } from "./instagramClient.js";
export type { InstagramSdkConfig } from "./instagramClient.js";
export { createMemoryStore } from "./store/memory.js";
export { createRedisStore } from "./store/redis.js";
export { createWebhookHandler } from "./webhook/handler.js";
export { ORDER } from "./types/shared.js";
// Error model lives at the "@tabsircg/fb-sdk/errors" subpath — see src/errors.ts.
export type { HttpClient } from "./httpClient.js";
export type { Store } from "./store/types.js";
export type { RedisLike } from "./store/redis.js";
export type { WebhookHandlerConfig } from "./webhook/handler.js";
export type { PageCommentConfig } from "./resources/comment/CommentResource.js";

export type * from "./types/facebookinsights.js";
export type * from "./types/facebookmedia.js";
export type * from "./types/instagram.js";
export type * from "./types/instagraminsights.js";
export type * from "./types/facebookpage.js";
export type * from "./types/facebookpost.js";
export type * from "./types/facebookuser.js";
export type * from "./types/shared.js";
export type * from "./types/webhook.js";
