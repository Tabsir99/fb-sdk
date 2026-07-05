/** The webhook `object` — the subscription topic an entry belongs to. */
export type WebhookObjectType =
  | "page"
  | "instagram"
  | "user"
  | "permissions"
  | "payments"
  // Forward-compat: Meta's object enum drifts (whatsapp_business_account, application, …).
  | (string & {});

/** Loose `value` payload of a webhook change; which fields appear depends on `object`/`field`. */
export interface RawWebhookValue {
  item?: string;
  verb?: string;
  from?: { id?: string; name?: string; username?: string };
  sender_id?: string;
  sender_name?: string;
  post_id?: string;
  comment_id?: string;
  parent_id?: string;
  created_time?: number;
  edited_time?: number;
  message?: string;
  is_hidden?: boolean;
  reaction_type?: string;
  id?: string;
  text?: string;
  media?: {
    id?: string;
    media_product_type?: string;
    ad_id?: string;
    ad_title?: string;
    original_media_id?: string;
  };
  media_id?: string;
  rating?: number;
  review_text?: string | null;
  recommendation_type?: "positive" | "negative";
  reviewer_id?: string;
  reviewer_name?: string;
  /** Unmodeled fields survive here. */
  [key: string]: unknown;
}

/** A `{ field, value }` change entry (Page and FB-Login Instagram webhooks). */
export interface RawWebhookChange {
  field: string;
  value: RawWebhookValue;
}

/** A messaging entry (Messenger / Instagram DMs); mostly passed through as `raw`. */
export interface RawWebhookMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  [key: string]: unknown;
}

/** One `entry` in a webhook payload; carries `changes`, `messaging`, or a flat `field`/`value`. */
export interface RawWebhookEntry {
  id: string;
  time: number;
  changes?: RawWebhookChange[];
  messaging?: RawWebhookMessaging[];
  /** Flat Instagram-Login content shape (paired with `value`). */
  field?: string;
  value?: RawWebhookValue;
}

/** Top-level webhook request body. */
export interface WebhookPayload {
  object: WebhookObjectType;
  entry: RawWebhookEntry[];
}

/** Which platform an event originated from. */
export type Platform = "facebook" | "instagram";

/** Discriminant for {@link WebhookEvent}. */
export type WebhookEventType =
  | "comment.added"
  | "comment.edited"
  | "comment.removed"
  | "comment.hidden"
  | "comment.unhidden"
  | "post.published"
  | "reaction.added"
  | "reaction.removed"
  | "mention.created"
  | "review.created"
  | "review.updated"
  | "unknown";

/** The actor behind an event (commenter, reactor, mentioner). */
export interface WebhookAuthor {
  id: string;
  /** Facebook display name. */
  name?: string;
  /** Instagram username. */
  username?: string;
}

interface WebhookEventBase {
  /** Page id (Facebook) or IG-User id (Instagram) that owns this event — `entry.id`. */
  accountId: string;
  /** `entry.time` — when Meta DISPATCHED the notification, not when the change happened (use `createdTime`). */
  time: number;
  /** The raw Meta change/messaging object, for anything this SDK doesn't model. */
  raw: RawWebhookChange | RawWebhookMessaging;
}

/** A comment on a Facebook post or an Instagram media (IG comments only fire as `added`). */
export interface CommentEvent extends WebhookEventBase {
  type: "comment.added" | "comment.edited" | "comment.removed" | "comment.hidden" | "comment.unhidden";
  platform: Platform;
  commentId: string;
  /** Parent comment id when this is a reply; on Facebook top-level comments it is the post id. */
  parentId?: string;
  /** Facebook: `post_id`. */
  postId?: string;
  /** Instagram: `media.id`. */
  mediaId?: string;
  text?: string;
  from?: WebhookAuthor;
  createdTime?: number;
  isHidden?: boolean;
}

/** A post/status/photo/video/… published on a Facebook Page. */
export interface PostEvent extends WebhookEventBase {
  type: "post.published";
  platform: "facebook";
  postId: string;
  /** The feed `item` — e.g. "status" | "photo" | "video" | "share" | "album" | "link". */
  postType: string;
  message?: string;
  from?: WebhookAuthor;
  createdTime?: number;
}

/** A reaction added/removed on a Facebook post or comment. */
export interface ReactionEvent extends WebhookEventBase {
  type: "reaction.added" | "reaction.removed";
  platform: "facebook";
  /** Wire name — e.g. "like" | "love" | "wow" | "haha" | "sorry" | "anger" | "care". */
  reactionType: string;
  postId?: string;
  /** Present when the reaction is on a comment rather than the post. */
  commentId?: string;
  from?: WebhookAuthor;
  createdTime?: number;
}

/** The account was @-mentioned. Instagram mentions are id-only — fetch text via the Graph API. */
export interface MentionEvent extends WebhookEventBase {
  type: "mention.created";
  platform: Platform;
  /** Facebook: `post_id`. */
  postId?: string;
  /** Instagram: `media_id`. */
  mediaId?: string;
  /** Present when the mention is inside a comment. */
  commentId?: string;
  /** Facebook mentions carry text; Instagram mentions do not. */
  text?: string;
  from?: WebhookAuthor;
  createdTime?: number;
}

/** A Facebook Page review/recommendation (the `ratings` field). */
export interface ReviewEvent extends WebhookEventBase {
  type: "review.created" | "review.updated";
  platform: "facebook";
  rating?: number;
  reviewText?: string | null;
  recommendationType?: "positive" | "negative";
  reviewerId?: string;
  reviewerName?: string;
  createdTime?: number;
}

/**
 * Anything parsed but not modeled — DMs/messaging, IG `live_comments`,
 * `story_insights`, unknown objects/fields. Captured (never dropped) so you can
 * still reach it via `raw`; inspect `object`/`field` to route it yourself.
 */
export interface UnknownEvent extends WebhookEventBase {
  type: "unknown";
  /** The webhook `object` — e.g. "page", "instagram", "user". */
  object: string;
  platform?: Platform;
  /** The raw field name, when the entry was change-based. */
  field?: string;
}

/** A normalized webhook event; switch on `type` to narrow. */
export type WebhookEvent =
  | CommentEvent
  | PostEvent
  | ReactionEvent
  | MentionEvent
  | ReviewEvent
  | UnknownEvent;
