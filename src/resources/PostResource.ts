import type { HttpClient } from "../httpClient.js";
import type { Comment, FacebookPost, PostExpiration } from "../types/facebookpost.js";
import { Collection, FbFieldSelector, FbPickDeep } from "../types/shared.js";
import { toGraphFields } from "../utils.js";

export type Expire = (postId: string, time: number, type: PostExpiration["type"]) => Promise<void>;
export type GetPost = <F extends FbFieldSelector<FacebookPost>>(
  postId: string,
  fields: F,
) => Promise<FbPickDeep<FacebookPost, F>>;

export function createPostResource(http: HttpClient) {
  const expire: Expire = async (postId, time, type) =>
    http.post(`/${postId}`, {
      expiration: { type, time: Math.ceil(time / 1000) } satisfies PostExpiration,
    });

  const get: GetPost = async (postId, fields) =>
    http.get(`/${postId}`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  return {
    expire,
    get,
    comments: createCommentResource(http),
  };
}

export type GetComments = <F extends FbFieldSelector<Comment>>(
  postId: string,
  fields: F,
) => Promise<Collection<Comment, F>>;

export const createCommentResource = (http: HttpClient) => {
  const get: GetComments = async (postId, fields) =>
    http.get(`/${postId}/comments`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  return {
    get,
  };
};
