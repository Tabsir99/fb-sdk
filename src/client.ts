import { createHttpClient, HttpClient } from "./httpClient.js";
import { createPostResource } from "./resources/PostResource.js";
import { createPageResource } from "./resources/PageResource.js";
import { createUserResource } from "./resources/UserResource.js";
import { createCommentResource } from "./resources/comment/CommentResource.js";
import { Store } from "./client.js";

export interface FbSdkConfig {
  store?: Store;
}

export interface CreateResourceParams {
  http: HttpClient;
  id: string;
  config?: FbSdkConfig;
}

export function createFbSdk(config: FbSdkConfig = {}) {
  return (accessToken: string) => {
    const http = createHttpClient(accessToken);
    return {
      post: (postId: string) => createPostResource({ http, id: postId, config }),
      page: (pageId: string) => createPageResource({ http, id: pageId, config }),
      comment: (commentId: string) => createCommentResource({ http, id: commentId, config }),
      me: createUserResource({ http, config, id: "me" }),
    };
  };
}

export { createMemoryStore } from "./store/memory.js";
export { createRedisStore } from "./store/redis.js";
export { createWebhookHandler } from "./webhook/handler.js";
export type { Store } from "./store/types.js";
export type { RedisLike } from "./store/redis.js";
export type { WebhookHandlerConfig } from "./webhook/handler.js";
export type {
  WebhookPayload,
  WebhookEntry,
  WebhookChange,
  WebhookFeedValue,
} from "./types/webhook.js";
export type { PageCommentConfig } from "./resources/comment/CommentResource.js";
export type * from "./types/facebookinsights.js";
