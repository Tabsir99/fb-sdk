import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { type GetNode, type ListEdge } from "../../types/shared.js";
import { type InstagramMedia, type InstagramUser } from "../../types/instagram.js";
import { createInstagramMediaResource } from "./InstagramMediaResource.js";
import { createInstagramAccountInsightResource } from "./InstagramInsightResource.js";
import { createInstagramMentionsResource } from "./InstagramMentionsResource.js";

export type GetInstagramAccount = GetNode<InstagramUser>;
export type ListInstagramStories = ListEdge<InstagramMedia>;
export type ListInstagramTags = ListEdge<InstagramMedia>;

/**
 * Instagram hub for a single IG professional account (the IG-User id discovered
 * via a Page's `instagram_business_account` field). Exposes the account node,
 * its media edge (publishing + listing), insights, mentions, stories and tags.
 */
export function createInstagramResource(params: CreateResourceParams) {
  const { http, id } = params;

  const get: GetInstagramAccount = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  const stories: ListInstagramStories = (query) =>
    http.get(`/${id}/stories`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  // Media this account has been @-tagged in by other users.
  const tags: ListInstagramTags = (query) =>
    http.get(`/${id}/tags`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  return {
    get,
    media: createInstagramMediaResource(params),
    insights: createInstagramAccountInsightResource(params),
    mentions: createInstagramMentionsResource(params),
    stories,
    tags,
  };
}
