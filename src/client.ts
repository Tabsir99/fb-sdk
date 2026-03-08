import { createHttpClient } from "./httpClient.js";
import { createPostResource } from "./resources/PostResource.js";
import { createPageResource } from "./resources/PageResource.js";
import { createUserResource } from "./resources/UserResource.js";
import { createCommentResource } from "./resources/CommentResource.js";

export function fbGraph(accessToken: string) {
  const http = createHttpClient(accessToken);
  return {
    posts: createPostResource(http),
    pages: (pageId: string) => ({
      ...createPageResource(http, pageId),
      comments: createCommentResource(http, pageId),
    }),
    me: createUserResource(http),
  };
}

export { createMemoryStore } from "./store/memory.js";
export { createRedisStore } from "./store/redis.js";
export { createWebhookHandler } from "./webhook/handler.js";
export type { CommentStore } from "./store/types.js";
export type { RedisLike } from "./store/redis.js";
export type {
  WebhookHandlerConfig,
  WebhookPayload,
  WebhookEntry,
  WebhookChange,
  WebhookFeedValue,
} from "./webhook/handler.js";
export type { PageCommentConfig } from "./resources/CommentResource.js";
