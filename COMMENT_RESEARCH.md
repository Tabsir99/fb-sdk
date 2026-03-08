# Comment System Research

Research conducted 2026-03-08 from official Facebook Graph API v25.0 documentation.

## 1. Comments Edge — `/{object-id}/comments`

### Supported Parameters

| Parameter | Type                       | Description                                                                                                                                   | Source                                                                                       |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `limit`   | int                        | Max objects returned (cursor-based pagination)                                                                                                | [Paginated Results](https://developers.facebook.com/docs/graph-api/results)                  |
| `after`   | string                     | Cursor pointing to end of page                                                                                                                | [Paginated Results](https://developers.facebook.com/docs/graph-api/results)                  |
| `before`  | string                     | Cursor pointing to start of page                                                                                                              | [Paginated Results](https://developers.facebook.com/docs/graph-api/results)                  |
| `filter`  | `"toplevel"` \| `"stream"` | `toplevel` (default): top-level comments in chronological order. `stream`: all-level comments in chronological order (useful for moderation). | [Object Comments](https://developers.facebook.com/docs/graph-api/reference/object/comments/) |
| `summary` | boolean                    | When `true`, returns `order` and `total_count` metadata                                                                                       | [Object Comments](https://developers.facebook.com/docs/graph-api/reference/object/comments/) |

since and until is supported as well

### `filter=toplevel` vs `filter=stream`

- `toplevel` (default): Returns only top-level comments (not replies), in chronological order. Matches the display order on Facebook.
- `stream`: Returns ALL comments including replies, in flat chronological order. Useful for moderation tools.
- When `summary=true`, `total_count` changes based on filter:
  - `filter=stream` → `total_count` counts all comments + replies
  - `filter=toplevel` → `total_count` counts only top-level comments

### Comment Replies — `/{comment-id}/comments`

Yes, comment replies are available via `/{comment-id}/comments`. Same edge structure, same parameters. This is explicitly documented: "It is possible for comment objects to have a /comments edge, which is called comment replies."

### Comment Fields (from `/{comment-id}` node)

| Field                 | Type            | Description                                            |
| --------------------- | --------------- | ------------------------------------------------------ |
| `id`                  | string          | Comment ID                                             |
| `message`             | string          | Comment text (default)                                 |
| `created_time`        | datetime        | When comment was made (default)                        |
| `from`                | object          | Profile that made the comment (default) — `{id, name}` |
| `is_hidden`           | boolean         | Hidden from everyone except author                     |
| `attachment`          | StoryAttachment | Link or photo attached to comment                      |
| `comment_count`       | int             | Number of replies                                      |
| `like_count`          | int             | Number of likes                                        |
| `parent`              | Comment         | For replies, the parent comment                        |
| `permalink_url`       | string          | Permanent URL to comment                               |
| `can_comment`         | boolean         | Whether viewer can reply                               |
| `can_hide`            | boolean         | Whether viewer can hide this comment                   |
| `can_like`            | boolean         | Whether viewer can like                                |
| `can_remove`          | boolean         | Whether viewer can remove                              |
| `is_private`          | boolean         | Whether it's a private comment                         |
| `user_likes`          | boolean         | Whether viewer liked this                              |
| `message_tags`        | list            | Profiles tagged in message                             |
| `admin_creator`       | User            | Page admin who wrote it (page access token required)   |
| `can_reply_privately` | boolean         | Whether page can send private reply                    |

## 2. Page Feed and Recent Activity

### `/{page-id}/feed` Behavior

- Returns posts including both published and unpublished (use `is_published` field to distinguish)
- **Ordering**: Posts are returned by creation time via cursor-based pagination. `since`/`until` provide time-based pagination (Unix timestamps, filter by `created_time`)
- **Max limit**: 100 posts per request. API returns ~600 ranked, published posts per year
- Supports `since` (Unix timestamp) and `until` (Unix timestamp) for time-based pagination

### `/{page-id}/published_posts` Behavior

- Same limitations as `/feed` (100 per request, ~600/year)
- Only returns published posts
- Same field support

### Does `since` on feed filter by creation or last activity?

`since`/`until` on the feed edge filter by **post creation time**, not by last activity. This is time-based pagination — it returns posts created within the time range.

### Is there an endpoint for recently-commented posts?

**No.** There is no Graph API endpoint that surfaces posts sorted by "most recently commented." The feed returns posts by creation time. The only way to discover which posts had recent comment activity is:

1. **Webhooks** — Subscribe to the `feed` field on the Page object. You receive notifications for comments as they happen, including `post_id`.
2. **Polling** — Fetch feed posts and check each one's comments. There is no shortcut.

## 3. Webhooks

### Subscription Setup

Subscribe to the `feed` field on the **Page** object type. This covers posts, shares, likes, comments, and other feed activity.

### Webhook Payload for Comments

When a comment is added to a Page post, the webhook payload looks like:

```json
{
  "entry": [
    {
      "changes": [
        {
          "field": "feed",
          "value": {
            "from": { "id": "{user-id}", "name": "User Name" },
            "item": "comment",
            "comment_id": "{comment-id}",
            "post_id": "{page-post-id}",
            "parent_id": "{parent-comment-id-or-post-id}",
            "created_time": 1520544814,
            "verb": "add",
            "message": "Comment text",
            "is_hidden": false
          }
        }
      ],
      "id": "{page-id}",
      "time": 1520544816
    }
  ],
  "object": "page"
}
```

### Key `value` Fields

| Field          | Description                                                                   |
| -------------- | ----------------------------------------------------------------------------- |
| `item`         | Type of feed change — `"comment"` for comment events, `"post"` for posts      |
| `verb`         | Action — `"add"`, `"edited"`, `"remove"`                                      |
| `post_id`      | The post the comment was made on                                              |
| `comment_id`   | The comment's ID                                                              |
| `parent_id`    | Parent object — post ID for top-level comments, parent comment ID for replies |
| `created_time` | Unix timestamp of the comment creation                                        |
| `from`         | `{id, name}` of the commenter                                                 |
| `message`      | The comment text                                                              |
| `is_hidden`    | Whether the comment is hidden                                                 |

### Signature Verification

Facebook sends an `X-Hub-Signature-256` header with every webhook POST. Format: `sha256={hash}`. The hash is an HMAC-SHA256 of the raw request body using the app secret as the key.

### Verification Challenge (GET)

Facebook verifies the webhook endpoint via a GET request with:

- `hub.mode` = `"subscribe"`
- `hub.verify_token` = the token you configured
- `hub.challenge` = a random string to echo back

## 4. Batch Requests

- **Max**: 50 requests per batch
- Each request in the batch counts individually toward rate limits
- Each request can have its own `relative_url`, `method`, `body`, and fields
- Requests are processed: independent ones in parallel, dependent ones sequentially
- Responses are returned in the same order as requests

### Batch Format

```json
POST https://graph.facebook.com/?batch=[
  {"method": "GET", "relative_url": "{post-id-1}/comments?fields=id,message&limit=25"},
  {"method": "GET", "relative_url": "{post-id-2}/comments?fields=id,message&limit=25"}
]&access_token={token}
```

## 5. Rate Limits

### Page Token Rate Limits

```
Calls within 24 hours = 4800 × Number of Engaged Users
```

- "Engaged Users" = users who engaged with the Page in the last 24 hours
- Rolling 24-hour window
- Each batch sub-request counts as a separate API call
- Applies when using **Page access tokens** or **system user access tokens**
- User/App access tokens follow Platform Rate Limits instead (200 calls/user/hour)

### Platform Rate Limits (User/App tokens)

- Application-level: 200 calls/user/hour
- Each call in a batch counts separately

## 6. Feasibility Conclusions

### Time Filtering on Comments

**Not directly supported.** The comments edge does not accept `since`/`until`. You must fetch all comments (paginated) and filter client-side by `created_time`, or use `filter=stream` to get them in chronological order and stop paginating once you pass your time boundary.

### Discovering Recently-Commented Posts

**No direct API support.** The only mechanisms are:

1. **Webhooks (recommended)**: Subscribe to `feed` on the Page, filter for `item === "comment"`, extract `post_id`. This is push-based and immediate.
2. **Polling/scanning**: Fetch recent posts via feed, then fetch comments from each. Comments on old posts that aren't in the recent feed will be missed.

### Batch Requests for Parallel Comment Fetching

**Beneficial.** Instead of making N sequential requests (one per post), batch up to 50 `/{post-id}/comments` requests per batch call. Each sub-request can have its own `fields` and params. This reduces HTTP round-trips significantly.

### Design Impact

The original design is sound with one adjustment:

- **Comments edge does NOT support `since`/`until`**: The SDK should NOT pass these to the comments endpoint. For on-demand mode, we fetch comments per post using cursor-based pagination and filter client-side by `created_time`. For webhook mode, the store already knows which posts have recent activity, so we fetch all recent comments from those specific posts.
- **`order` is NOT a query param on comments**: It's only a response field in `summary`. Comments come back chronologically by default. We sort merged results ourselves.
