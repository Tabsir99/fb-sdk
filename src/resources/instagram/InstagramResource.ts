import { type CreateResourceParams } from "../../client.js";
import { toGraphFields } from "../../internal/utils.js";
import { type GetNode, type ListEdge } from "../../types/shared.js";
import { type InstagramMedia, type InstagramUser } from "../../types/instagram.js";
import { createInstagramMediaResource } from "./InstagramMediaResource.js";
import { createInstagramAccountInsightResource } from "./InstagramInsightResource.js";
import { createInstagramMentionsResource } from "./InstagramMentionsResource.js";

/** Read fields off the IG professional account node. */
export type GetInstagramAccount = GetNode<InstagramUser>;
/** List the account's currently active stories. */
export type ListInstagramStories = ListEdge<InstagramMedia>;
/** List media other users have @-tagged this account in. */
export type ListInstagramTags = ListEdge<InstagramMedia>;

/**
 * Instagram hub for a single IG professional account (the authenticated IG-User
 * under Instagram Login). Exposes the account node, its media edge (publishing +
 * listing), insights, mentions, stories and tags.
 */
export function createInstagramResource(params: CreateResourceParams) {
  const { http, id } = params;

  /** Fetch fields off this account node. */
  const get: GetInstagramAccount = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });

  /** List the account's currently active stories. */
  const stories: ListInstagramStories = (query) =>
    http.get(`/${id}/stories`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  /** List media other users have @-tagged this account in. */
  const tags: ListInstagramTags = (query) =>
    http.get(`/${id}/tags`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  return {
    get,
    /** Publishing pipeline (image/reel/story/carousel) and media listing. */
    media: createInstagramMediaResource(params),
    /** Account-level insights — reach, views, follower demographics. */
    insights: createInstagramAccountInsightResource(params),
    /** Read @-mentions of this account and reply to them. */
    mentions: createInstagramMentionsResource(params),
    stories,
    tags,
  };
}
