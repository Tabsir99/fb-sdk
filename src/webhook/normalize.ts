import {
  type Platform,
  type RawWebhookChange,
  type RawWebhookEntry,
  type RawWebhookMessaging,
  type RawWebhookValue,
  type WebhookAuthor,
  type WebhookEvent,
  type WebhookPayload,
} from "../types/webhook.js";

// Feed `item` values that represent a published post (verb "add" → post.published).
const POST_ITEMS = new Set(["post", "status", "photo", "video", "link", "share", "album", "note"]);

function platformOf(object: string): Platform | undefined {
  if (object === "page") return "facebook";
  if (object === "instagram") return "instagram";
  return undefined;
}

// Unify author: most fields use `from{id,name|username}`; ratings & legacy feed/mention use top-level `sender_*`.
function authorOf(value: RawWebhookValue): WebhookAuthor | undefined {
  if (value.from?.id) {
    return {
      id: value.from.id,
      ...(value.from.name !== undefined ? { name: value.from.name } : {}),
      ...(value.from.username !== undefined ? { username: value.from.username } : {}),
    };
  }
  if (value.sender_id) {
    return {
      id: value.sender_id,
      ...(value.sender_name !== undefined ? { name: value.sender_name } : {}),
    };
  }
  return undefined;
}

interface Common {
  accountId: string;
  time: number;
  raw: RawWebhookChange | RawWebhookMessaging;
}

function unknownEvent(common: Common, object: string, platform?: Platform, field?: string): WebhookEvent {
  return {
    ...common,
    type: "unknown",
    object,
    ...(platform ? { platform } : {}),
    ...(field ? { field } : {}),
  };
}

function fbFeed(common: Common, value: RawWebhookValue, object: string): WebhookEvent {
  const from = authorOf(value);
  const { item, verb } = value;

  if (item === "comment") {
    const commentId = value.comment_id ?? value.id;
    const type =
      verb === "add"
        ? "comment.added"
        : verb === "edited" || verb === "edit"
          ? "comment.edited"
          : verb === "remove" || verb === "delete"
            ? "comment.removed"
            : verb === "hide"
              ? "comment.hidden"
              : verb === "unhide"
                ? "comment.unhidden"
                : undefined;
    if (type && commentId) {
      return {
        ...common,
        type,
        platform: "facebook",
        commentId,
        ...(value.parent_id ? { parentId: value.parent_id } : {}),
        ...(value.post_id ? { postId: value.post_id } : {}),
        ...(value.message !== undefined ? { text: value.message } : {}),
        ...(from ? { from } : {}),
        ...(value.created_time !== undefined ? { createdTime: value.created_time } : {}),
        ...(value.is_hidden !== undefined ? { isHidden: value.is_hidden } : {}),
      };
    }
  }

  if (item === "reaction") {
    const type = verb === "add" ? "reaction.added" : verb === "remove" ? "reaction.removed" : undefined;
    if (type) {
      return {
        ...common,
        type,
        platform: "facebook",
        reactionType: value.reaction_type ?? "",
        ...(value.post_id ? { postId: value.post_id } : {}),
        ...(value.comment_id ? { commentId: value.comment_id } : {}),
        ...(from ? { from } : {}),
        ...(value.created_time !== undefined ? { createdTime: value.created_time } : {}),
      };
    }
  }

  if (item && POST_ITEMS.has(item) && verb === "add" && value.post_id) {
    return {
      ...common,
      type: "post.published",
      platform: "facebook",
      postId: value.post_id,
      postType: item,
      ...(value.message !== undefined ? { message: value.message } : {}),
      ...(from ? { from } : {}),
      ...(value.created_time !== undefined ? { createdTime: value.created_time } : {}),
    };
  }

  return unknownEvent(common, object, "facebook", "feed");
}

function fbMention(common: Common, value: RawWebhookValue): WebhookEvent {
  const from = authorOf(value);
  return {
    ...common,
    type: "mention.created",
    platform: "facebook",
    ...(value.post_id ? { postId: value.post_id } : {}),
    ...(value.comment_id ? { commentId: value.comment_id } : {}),
    ...(value.message !== undefined ? { text: value.message } : {}),
    ...(from ? { from } : {}),
    ...(value.created_time !== undefined ? { createdTime: value.created_time } : {}),
  };
}

function fbRatings(common: Common, value: RawWebhookValue): WebhookEvent {
  const type = value.verb === "edited" || value.verb === "edit" ? "review.updated" : "review.created";
  return {
    ...common,
    type,
    platform: "facebook",
    ...(value.rating !== undefined ? { rating: value.rating } : {}),
    ...(value.review_text !== undefined ? { reviewText: value.review_text } : {}),
    ...(value.recommendation_type ? { recommendationType: value.recommendation_type } : {}),
    ...(value.reviewer_id ? { reviewerId: value.reviewer_id } : {}),
    ...(value.reviewer_name ? { reviewerName: value.reviewer_name } : {}),
    ...(value.created_time !== undefined ? { createdTime: value.created_time } : {}),
  };
}

function igComment(common: Common, value: RawWebhookValue, object: string): WebhookEvent {
  // IG comment id is `id` (flat login shape) or `comment_id` (FB-login shape).
  const commentId = value.comment_id ?? value.id;
  if (!commentId) return unknownEvent(common, object, "instagram", "comments");
  const from = authorOf(value);
  const mediaId = value.media?.id;
  return {
    ...common,
    type: "comment.added", // IG only fires on new comments
    platform: "instagram",
    commentId,
    ...(value.parent_id ? { parentId: value.parent_id } : {}),
    ...(mediaId ? { mediaId } : {}),
    ...(value.text !== undefined ? { text: value.text } : {}),
    ...(from ? { from } : {}),
  };
}

function igMention(common: Common, value: RawWebhookValue): WebhookEvent {
  return {
    ...common,
    type: "mention.created",
    platform: "instagram",
    ...(value.media_id ? { mediaId: value.media_id } : {}),
    ...(value.comment_id ? { commentId: value.comment_id } : {}),
  };
}

function normalizeChange(object: string, entry: RawWebhookEntry, change: RawWebhookChange): WebhookEvent {
  const platform = platformOf(object);
  const value = change.value ?? {};
  const common: Common = { accountId: entry.id, time: entry.time, raw: change };

  if (platform === "facebook") {
    if (change.field === "feed") return fbFeed(common, value, object);
    if (change.field === "mention") return fbMention(common, value);
    if (change.field === "ratings") return fbRatings(common, value);
  } else if (platform === "instagram") {
    if (change.field === "comments") return igComment(common, value, object);
    if (change.field === "mentions") return igMention(common, value);
  }

  return unknownEvent(common, object, platform, change.field);
}

function normalizeMessaging(object: string, entry: RawWebhookEntry, m: RawWebhookMessaging): WebhookEvent {
  // DMs are out of scope for now — captured as `unknown`, reachable via `raw`.
  const common: Common = { accountId: entry.id, time: entry.time, raw: m };
  return unknownEvent(common, object, platformOf(object));
}

function normalizeEntry(object: string, entry: RawWebhookEntry): WebhookEvent[] {
  // Three envelope shapes: changes[] | flat field+value | messaging[].
  if (entry.changes && entry.changes.length) {
    return entry.changes.map((c) => normalizeChange(object, entry, c));
  }
  if (entry.field) {
    return [normalizeChange(object, entry, { field: entry.field, value: entry.value ?? {} })];
  }
  if (entry.messaging && entry.messaging.length) {
    return entry.messaging.map((m) => normalizeMessaging(object, entry, m));
  }
  return [];
}

/**
 * Parse a raw Meta webhook payload into normalized, platform-tagged events.
 * Handles all three entry shapes and unifies Facebook/Instagram differences.
 * Anything not modeled becomes an `unknown` event rather than being dropped.
 */
export function normalizePayload(payload: WebhookPayload): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  for (const entry of payload.entry ?? []) {
    events.push(...normalizeEntry(payload.object, entry));
  }
  return events;
}
