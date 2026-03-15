type WebhookObject = "page" | "user" | "permissions" | "payments";
type FeedItem =
  | "post"
  | "comment"
  | "reaction"
  | "status"
  | "photo"
  | "video"
  | "share"
  | "note"
  | "link";
type FeedVerb = "add" | "edited" | "remove" | "hide" | "unhide";
type ReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry" | "care";

interface WebhookFeedValueBase {
  from?: { id: string; name: string };
  item: FeedItem;
  verb: FeedVerb;
  created_time: number;
}

// Discriminated unions per item type
interface PostFeedValue extends WebhookFeedValueBase {
  item: "post" | "status" | "photo" | "video" | "link" | "share" | "note";
  post_id: string;
  message?: string;
  is_hidden?: boolean;
}

interface CommentFeedValue extends WebhookFeedValueBase {
  item: "comment";
  comment_id: string;
  post_id: string;
  parent_id: string; // same as post_id if top-level, comment_id if reply
  message?: string;
  is_hidden?: boolean;
}

interface ReactionFeedValue extends WebhookFeedValueBase {
  item: "reaction";
  post_id: string;
  parent_id?: string; // present if reaction is on a comment
  reaction_type: ReactionType;
}

export type WebhookFeedValue = PostFeedValue | CommentFeedValue | ReactionFeedValue;

export interface WebhookChange {
  field: "feed" | "mention" | "reactions" | "leadgen" | "messages";
  value: WebhookFeedValue;
}

export interface WebhookEntry {
  id: string; // page_id
  time: number;
  changes: WebhookChange[];
}

export interface WebhookPayload {
  object: WebhookObject;
  entry: WebhookEntry[];
}
