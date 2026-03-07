import { createHttpClient } from "./httpClient.js";
import { createPostResource } from "./resources/PostResource.js";
import { createPageResource } from "./resources/PageResource.js";
import { createUserResource } from "./resources/UserResource.js";

export function fbGraph(accessToken: string) {
  const http = createHttpClient(accessToken);
  return {
    posts: createPostResource(http),
    pages: (pageId: string) => createPageResource(http, pageId),
    me: createUserResource(http),
  };
}
