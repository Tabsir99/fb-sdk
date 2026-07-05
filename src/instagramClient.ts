import { createHttpClient, type HttpClient } from "./httpClient.js";
import { createInstagramResource } from "./resources/instagram/InstagramResource.js";
import { createInstagramMediaNodeResource } from "./resources/instagram/InstagramMediaNodeResource.js";
import { createInstagramCommentResource } from "./resources/instagram/InstagramCommentResource.js";
import type { FacebookErrorHook } from "./internal/error.js";

/** Configuration for {@link createInstagramSdk}. */
export interface InstagramSdkConfig {
  /**
   * Invoked after a response is received but before it is returned/thrown,
   * whenever an error is detected. Same strictly-typed Graph error hook the
   * Facebook SDK uses — Instagram errors share the Graph error envelope.
   */
  onError?: FacebookErrorHook;
}

/**
 * Standalone Instagram SDK — talks to `graph.instagram.com` with an Instagram
 * user access token (Instagram API with Instagram Login). No Facebook Page or
 * Page token is involved. Bring your own token; obtain and refresh it out of band.
 *
 * Nodes are keyed by their own id, so `media`/`comment` are top-level (mirroring
 * the Facebook SDK's `post`/`comment`), not chained under `account`.
 *
 * @example
 * const ig = createInstagramSdk()("IG_USER_ACCESS_TOKEN");
 * const media = await ig.media("MEDIA_ID").get({ caption: true });
 */
export function createInstagramSdk(config: InstagramSdkConfig = {}) {
  return (accessToken: string) => {
    const http: HttpClient = createHttpClient(accessToken, {
      onError: config.onError,
      host: "instagram",
    });
    return {
      /** An IG professional account node + its edges: media (publish/list), insights, mentions, stories, tags. */
      account: (igUserId: string) => createInstagramResource({ http, id: igUserId, config }),
      /** A single media node: get, insights, comments, setCommentEnabled. */
      media: (mediaId: string) => createInstagramMediaNodeResource({ http, id: mediaId, config }),
      /** A single comment node: get, reply, replies, hide, delete. */
      comment: (commentId: string) => createInstagramCommentResource({ http, id: commentId, config }),
      /** Escape hatch: the raw Instagram-Graph http client. */
      http,
    };
  };
}
