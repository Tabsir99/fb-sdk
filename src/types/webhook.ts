export interface WebhookEntry {
  id: string;
  time: number;
  changes: WebhookChange[];
}

export interface WebhookChange {
  field: string;
  value: WebhookFeedValue;
}

export interface WebhookFeedValue {
  from?: { id: string; name: string };
  item: string;
  verb: string;
  post_id?: string;
  comment_id?: string;
  parent_id?: string;
  created_time: number;
  is_hidden?: boolean;
  message?: string;
}

export interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}
