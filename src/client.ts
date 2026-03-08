import { createHttpClient } from "./httpClient.js";
import { createPostResource } from "./resources/PostResource.js";
import { createPageResource } from "./resources/PageResource.js";
import { createUserResource } from "./resources/UserResource.js";
import { createCommentResource } from "./resources/CommentResource.js";

export function fbGraph(accessToken: string) {
  const http = createHttpClient(accessToken);
  return {
    post: (postId: string) => createPostResource(http, postId),
    page: (pageId: string) => createPageResource(http, pageId),
    comment: (commentId: string) => createCommentResource(http, commentId),
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
