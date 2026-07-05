# Meta Graph API Webhooks — Raw Research (for a strictly-typed TS SDK)

> Research compiled 2026-07-05 against **Graph API v25.0** docs on developers.facebook.com.
> Purpose: give the `@tabsircg/fb-sdk` author exact payload shapes so the webhook
> layer can be modeled as a discriminated-union in TypeScript.
> This is **research only** — no SDK code here.
>
> **Scope reminder.** Scheduly manages **Facebook Pages** (`graph.facebook.com`, Page tokens)
> and **Instagram professional accounts** under BOTH login models:
> **Facebook Login** (IG accessed via a linked Page) and **Instagram Login**
> (standalone, `graph.instagram.com`, IG-User tokens). Webhook payloads therefore
> arrive under multiple `object` types and, for Instagram, in **two different entry shapes**.
>
> **How to read the JSON blocks.** Each block is tagged:
> - `VERBATIM` — copied character-for-character out of the live Meta doc (typos preserved, flagged).
> - `REPRESENTATIVE` — composed from Meta's documented field **schema** + the well-known
>   canonical shape, because Meta **deleted the full `feed` JSON examples** from current docs
>   (only the schema table survives — see §5).

---

## Table of contents

1. [Webhook setup & subscription model](#1-webhook-setup--subscription-model)
2. [Verification handshake (GET)](#2-verification-handshake-get)
3. [Payload security — signatures & raw body](#3-payload-security--signatures--raw-body)
4. [Envelope structure — `changes[]` vs `messaging[]`](#4-envelope-structure--changes-vs-messaging)
5. [Facebook Page `feed` field (the big one)](#5-facebook-page-feed-field-the-big-one)
6. [Other FB Page fields — `mention`, `ratings`, Messenger](#6-other-fb-page-fields--mention-ratings-messenger)
7. [Instagram webhooks — the two shapes](#7-instagram-webhooks--the-two-shapes)
8. [Delivery semantics](#8-delivery-semantics)
9. [Version notes (v22–v25, 2024–2026)](#9-version-notes-v22v25-20242026)
10. [Ambiguities & doc-quality defects (consolidated)](#10-ambiguities--doc-quality-defects-consolidated)
11. [Relevant-to-Scheduly summary](#11-relevant-to-scheduly-summary)

---

## 1. Webhook setup & subscription model

There are **three distinct subscription layers**. All three must be in place before a single event fires — this trips up almost everyone.

### 1a. App-level subscription (`/{app-id}/subscriptions`)

You register the callback URL + the fields your app cares about **per `object` topic**, once per app. Done in the App Dashboard **or** via the Graph API `subscriptions` edge.

`VERBATIM` — create request:

```
POST /v25.0/{app-id}/subscriptions HTTP/1.1
Host: graph.facebook.com

object=page&callback_url=http%3A%2F%2Fexample.com%2Fcallback%2F&fields=about%2C+picture&include_values=true&verify_token=thisisaverifystring
```

Create/read parameters (`VERBATIM` from the edge reference "Fields" table):

| Name | Description | Type |
|---|---|---|
| `object` | Indicates the object type that this subscription applies to. | `enum{user, page, permissions, payments}` |
| `callback_url` | The URL that will receive the POST request when an update is triggered. | `string` |
| `fields` | The set of fields in this object that are subscribed to. | `string[]` |
| `active` | Indicates whether or not the subscription is active. | `bool` |
| `include_values` | (create-only, in the POST body) whether payloads carry new values (`changes`) or only field names (`changed_fields`). | `bool` |
| `verify_token` | (create-only) the string echoed back during the GET handshake. | `string` |

- Reading requires an **app access token**: `GET /v25.0/{app-id}/subscriptions`.
- **DOC DEFECT (flagged):** the reference "Fields" enum lists only `{user, page, permissions, payments}` — it **omits `instagram`, `application`, and `whatsapp_business_account`**, all of which are real, subscribable topics documented elsewhere on the same site. Treat that enum as stale; do not use it to constrain a TS union.

### 1b. Object topics (`object` values) that actually exist

From the Webhooks nav + product docs, the available topics are:

`user`, `page`, `instagram`, `permissions`, `application`, `payments`, `whatsapp_business_account`, plus product topics: **Ad Accounts**, **Leads (`leadgen`)**, **Catalogs**, **Messenger** (delivered under `page`), **Payments**.

For Scheduly the only relevant `object` values are **`page`** and **`instagram`**.

### 1c. Per-asset subscription via the `subscribed_apps` edge

The app subscription (1a) says "this app wants `feed`". You **also** have to install the app **onto each individual Page / IG account** or nothing is delivered for that asset.

**Facebook Page** (`graph.facebook.com`, **Page access token**):

```
POST /v25.0/{page-id}/subscribed_apps?subscribed_fields=feed,mention,ratings&access_token={page-access-token}
GET  /v25.0/{page-id}/subscribed_apps?access_token={page-access-token}   # verify
```

**Instagram (Instagram Login)** (`graph.instagram.com`, **IG-User access token**) — `VERBATIM` shape:

```
POST /me/subscribed_apps?subscribed_fields=<LIST>&access_token=<TOKEN>
→ {"success": true}
```
Here `/me` is the IG professional account; the token is "an App user's Instagram User access token."

**Instagram (Facebook Login)**: the IG account is subscribed through its linked Page's `subscribed_apps` edge, same as a Page.

> **Key takeaway for the SDK:** three layers — app callback (once), app field-subscription (per topic), and `subscribed_apps` install (per Page / per IG user). The SDK's webhook *receiver* only sees layer-3 output, but the docs for setup must mention all three.

**Sources:**
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- https://developers.facebook.com/docs/graph-api/reference/v25.0/app/subscriptions
- https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/
- https://developers.facebook.com/docs/instagram-platform/webhooks

---

## 2. Verification handshake (GET)

When you (or Meta) (re)configure the webhook, Meta sends a **GET** to your callback URL:

`VERBATIM`:

```
GET https://www.your-clever-domain-name.com/webhooks?
  hub.mode=subscribe&
  hub.challenge=1158201444&
  hub.verify_token=meatyhamhock
```

| Parameter | Sample | Description (`VERBATIM`) |
|---|---|---|
| `hub.mode` | `subscribe` | "This value will always be set to `subscribe`." |
| `hub.challenge` | `1158201444` | "An `int` you must pass back to us." |
| `hub.verify_token` | `meatyhamhock` | "A string that we grab from the **Verify Token** field in your app's App Dashboard." |

**Required behavior (`VERBATIM`):**
1. "Verify that the `hub.verify_token` value matches the string you set in the **Verify Token** field…"
2. "Respond with the `hub.challenge` value."

Correct response: **HTTP 200** with the **raw `hub.challenge` value as the body** (plain text, no JSON, no quotes). Mismatched token → **403**.

- **Gotcha (`VERBATIM`):** "PHP converts periods (`.`) to underscores (`_`) in parameter names." So in some frameworks the params arrive as `hub_mode` / `hub_challenge` / `hub_verify_token`. A TS SDK should read both dotted and underscored keys defensively.
- `hub.challenge` is an integer *string* on the wire — echo it back exactly as received (do not `parseInt` and re-serialize; leading/formatting must match).

**Source:** https://developers.facebook.com/docs/graph-api/webhooks/getting-started

---

## 3. Payload security — signatures & raw body

Every event POST carries an HMAC signature header.

`VERBATIM` (request headers as shown on the Getting Started page):

```
POST / HTTPS/1.1
Host: your-clever-domain-name.com/webhooks
Content-Type: application/json
X-Hub-Signature-256: sha256={super-long-SHA256-signature}
Content-Length: 311
```

**Validation (`VERBATIM`):**
- "We sign all Event Notification payloads with a **SHA256** signature and include the signature in the request's `X-Hub-Signature-256` header, preceded with `sha256=`."
- "Generate a SHA256 signature using the payload and your app's **App Secret**."
- "Compare your signature to the signature in the `X-Hub-Signature-256` header (everything after `sha256=`). If the signatures match, the payload is genuine."
- "You don't have to validate the payload, but you should."

**Mechanics the SDK must get right:**
- Signature = `HMAC-SHA256(key = APP_SECRET, message = RAW_REQUEST_BODY)`, hex-encoded, compared against the hex after `sha256=`.
- **Raw body is mandatory.** The HMAC is over the *exact bytes* Meta sent. If any middleware JSON-parses and re-serializes the body, key order / whitespace / unicode-escaping change and the signature will never match. (The repo already documents this — `express.json({ verify })` to stash `req.rawBody`.) Meta's own doc understates this ("using the payload"), but it is the #1 cause of "signature mismatch" threads in Meta's forums.
- Use a constant-time compare (`crypto.timingSafeEqual`).
- **App secret vs. `appsecret_proof`:** the key is the **plain App Secret**, not an appsecret_proof. For Instagram Login apps the relevant secret is the **Instagram app secret** of that app.

**Legacy `X-Hub-Signature` (SHA1):**
- Historically Meta *also* sent `X-Hub-Signature: sha1={hex}` (HMAC-SHA1 over the raw body). It is the older, weaker header.
- **The current (v25.0) Getting Started page no longer mentions it** — only `X-Hub-Signature-256` is documented. It is still emitted in some product surfaces for backward-compat, but should be treated as **deprecated / do-not-rely-on**. A strictly-typed SDK should verify `X-Hub-Signature-256` and may optionally *also* accept `X-Hub-Signature` as a fallback, but must not require it.

**mTLS (optional hardening, mostly WhatsApp today):** Meta can present a client cert signed by a Meta CA (`meta-outbound-api-ca-2025-12.pem`, replacing the DigiCert one that expired 2026-04-15); verify the client cert's CN = `client.webhooks.fbclientcerts.com`. Out of scope for Scheduly but noted.

**Source:** https://developers.facebook.com/docs/graph-api/webhooks/getting-started

---

## 4. Envelope structure — `changes[]` vs `messaging[]`

### Top-level

`VERBATIM` common-properties table:

| Property | Type | Description |
|---|---|---|
| `object` | `string` | "The object's type (e.g., `user`, `page`, etc.)" |
| `entry` | `array` | "An array containing an object describing the changes. **Multiple changes from different objects that are of the same type may be batched together.**" |
| `id` | `string` | "The object's ID" (the Page ID or IG account ID) |
| `time` | `int` | "A UNIX timestamp indicating when the Event Notification was **sent** (not when the change… occurred)." |
| `changed_fields` | `array` | "…names of the fields that have been changed. **Only** included if you **disable** the Include Values setting…" |
| `changes` | `array` | "…the changed fields and their new values. **Only** included if you **enable** the Include Values setting…" |

Canonical generic example (`VERBATIM`, the boilerplate `user`/`photos` sample that appears on Getting Started and gets copy-pasted across many pages — **do not mistake it for a Page or IG example**):

```json
{
  "entry": [
    {
      "time": 1520383571,
      "changes": [
        {
          "field": "photos",
          "value": {
            "verb": "update",
            "object_id": "10211885744794461"
          }
        }
      ],
      "id": "10210299214172187",
      "uid": "10210299214172187"
    }
  ],
  "object": "user"
}
```

### The two branches

An `entry[]` element carries **one of**:
- **`changes[]`** — each element `{ field, value }`. Used by `page`, `instagram` (Facebook-Login), `user`, etc. This is the "Include Values ON" form; with it OFF you'd instead get `changed_fields: string[]`.
- **`messaging[]`** — each element `{ sender, recipient, timestamp, <payload> }`. Used by **Messenger** (under `object:"page"`) and **Instagram DMs** (under `object:"instagram"`).
- **(Instagram Login only) a *flat* `field` + `value` directly on the `entry`** — see §7; this is the contested shape.

**`uid`** appears on the `user`-object sample (duplicate of `id`); not present on Page/IG payloads. Don't model it as required.

**Design implication:** the entry is a **discriminated union on the presence of `changes` vs `messaging` (vs flat `field`)** — not on `object`. A single receiver must branch on which array is present.

**Source:** https://developers.facebook.com/docs/graph-api/webhooks/getting-started

---

## 5. Facebook Page `feed` field (the big one)

`object: "page"`, `changes[].field: "feed"`. This one field fires for nearly everything on the Page's timeline: posts, photos, videos, shares, comments, reactions/likes, albums, etc.

> **DOC DEFECT (flagged):** Meta's **current** Page reference is a **schema table with ZERO JSON examples**, and the old `/docs/graph-api/webhooks/v2.5` page that used to carry full `feed` examples now **301-redirects to Getting Started** (which only has the generic `user`/`photos` sample). So the full `value` JSON below is `REPRESENTATIVE` — assembled from the verbatim schema table + the long-standing canonical shape emitted by the App Dashboard "Send to Server" test tool. Field **names/types are authoritative**; example **values** are illustrative.

### 5a. `value.item` enum (`VERBATIM`)

```
album, address, comment, connection, coupon, event, experience, group,
group_message, interest, link, mention, milestone, note, page, picture,
platform-story, photo, photo-album, post, profile, question, rating,
reaction, relationship-status, share, status, story, timeline cover, tag, video
```

### 5b. `value.verb` enum (`VERBATIM`)

```
add, block, edit, edited, delete, follow, hide, mute, remove, unblock, unhide, update
```

> **AMBIGUITY (flagged):** the enum contains **both `edit` and `edited`**, and **both `delete` and `remove`**. In practice **`edited`** and **`remove`** are what real `feed` deliveries use for comments/posts; `edit`/`delete` are near-never seen on `feed`. Model all four in the type but expect `edited`/`remove` at runtime.

### 5c. Full `value` schema (`VERBATIM` field list for `feed`)

`edited_time`, `from{ id, name }`, `post` (a PagePost: `status_type`, `is_published`, `updated_time`, `permalink_url`, `promotion_status`), `status_type`, `is_published`, `updated_time`, `permalink_url`, `is_hidden`, `link`, `message`, `photo`, `photo_ids[]`, `photos[]`, `post_id`, `story`, `title`, `video`, `video_flag_reason`, `action`, `album_id`, `comment_id`, `created_time`, `event_id`, `item` (enum §5a), `open_graph_story_id`, `parent_id`, `photo_id`, `reaction_type`, `published`, `recipient_id`, `share_id`, `verb` (enum §5b), `video_id`.

> **AMBIGUITY (flagged) — `from` vs `sender_*`:** the **current `feed` schema uses `from{id,name}`**. But (a) the sibling **`ratings`** field uses `sender_id`/`sender_name` (see §6), and (b) historically many real `feed` comment payloads carried top-level `sender_name` (and sometimes `sender_email`) instead of / in addition to `from`. The observed shape varies by API version and event. **The SDK should treat both `from{id,name}` and `sender_id`/`sender_name` as possible** and normalize. Meta does not reconcile this in one place.

### 5d. Representative payloads

**Comment — add** (`REPRESENTATIVE`):

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1520383571,
      "changes": [
        {
          "field": "feed",
          "value": {
            "from": { "id": "<COMMENTER_USER_ID>", "name": "Jane Doe" },
            "item": "comment",
            "comment_id": "<POST_ID>_<COMMENT_ID>",
            "post_id": "<PAGE_ID>_<POST_ID>",
            "parent_id": "<PAGE_ID>_<POST_ID>",
            "verb": "add",
            "created_time": 1520383571,
            "message": "Love this!"
          }
        }
      ]
    }
  ]
}
```

Notes: `parent_id` = the post ID for a top-level comment, or the **parent comment ID** for a reply. `comment_id` is `{postId}_{commentId}`; `post_id` is `{pageId}_{postId}`.

**Comment — edited** (`REPRESENTATIVE`) — same shape, `verb:"edited"`, updated `message`, usually an `edited_time`:

```json
{
  "field": "feed",
  "value": {
    "from": { "id": "<COMMENTER_USER_ID>", "name": "Jane Doe" },
    "item": "comment",
    "comment_id": "<POST_ID>_<COMMENT_ID>",
    "post_id": "<PAGE_ID>_<POST_ID>",
    "parent_id": "<PAGE_ID>_<POST_ID>",
    "verb": "edited",
    "created_time": 1520383571,
    "edited_time": 1520383999,
    "message": "Love this!! (edited)"
  }
}
```

**Comment — remove** (`REPRESENTATIVE`) — `verb:"remove"`; `message` typically absent:

```json
{
  "field": "feed",
  "value": {
    "from": { "id": "<COMMENTER_USER_ID>", "name": "Jane Doe" },
    "item": "comment",
    "comment_id": "<POST_ID>_<COMMENT_ID>",
    "post_id": "<PAGE_ID>_<POST_ID>",
    "parent_id": "<PAGE_ID>_<POST_ID>",
    "verb": "remove",
    "created_time": 1520384100
  }
}
```

**Comment — hide** (`REPRESENTATIVE`) — Page moderated (hid) the comment; `verb:"hide"` (or `"unhide"`), `is_hidden:true`:

```json
{
  "field": "feed",
  "value": {
    "from": { "id": "<COMMENTER_USER_ID>", "name": "Jane Doe" },
    "item": "comment",
    "comment_id": "<POST_ID>_<COMMENT_ID>",
    "post_id": "<PAGE_ID>_<POST_ID>",
    "parent_id": "<PAGE_ID>_<POST_ID>",
    "verb": "hide",
    "is_hidden": true,
    "created_time": 1520383571,
    "message": "Love this!"
  }
}
```

**Reaction — add** (`REPRESENTATIVE`) — a like/love/etc. on a **post**:

```json
{
  "field": "feed",
  "value": {
    "from": { "id": "<REACTOR_USER_ID>", "name": "John Roe" },
    "item": "reaction",
    "reaction_type": "love",
    "verb": "add",
    "post_id": "<PAGE_ID>_<POST_ID>",
    "parent_id": "<PAGE_ID>_<POST_ID>",
    "created_time": 1520383571
  }
}
```
- `reaction_type` values seen: `like, love, wow, haha, sorry` (the sad face), `anger` (the angry face), `care`, plus others. (`sorry`/`anger` are the wire names — not `sad`/`angry`.)
- Reaction **on a comment**: `parent_id` = the comment ID and a `comment_id` is present.

**Reaction — remove** (`REPRESENTATIVE`) — user un-reacted; `verb:"remove"`, `reaction_type` still names which reaction was removed:

```json
{
  "field": "feed",
  "value": {
    "from": { "id": "<REACTOR_USER_ID>", "name": "John Roe" },
    "item": "reaction",
    "reaction_type": "love",
    "verb": "remove",
    "post_id": "<PAGE_ID>_<POST_ID>",
    "parent_id": "<PAGE_ID>_<POST_ID>",
    "created_time": 1520384200
  }
}
```

**Post / status — add** (`REPRESENTATIVE`) — the Page (or a visitor) published a status:

```json
{
  "field": "feed",
  "value": {
    "from": { "id": "<PAGE_ID>", "name": "My Page" },
    "item": "status",
    "post_id": "<PAGE_ID>_<POST_ID>",
    "verb": "add",
    "published": 1,
    "is_published": true,
    "created_time": 1520383571,
    "message": "Our new opening hours…"
  }
}
```
- Photo post → `item:"photo"`, adds `photo_id`, `link`, sometimes `photo_ids[]`/`photos[]`.
- Video post → `item:"video"`, adds `video_id`, `link`.
- Shared post → `item:"share"`, adds `share_id`.
- Album → `item:"album"`, adds `album_id`.

> **`VERBATIM` limitation from the reference:** "Webhooks are **not** sent for Ad Posts, but **are** sent for **Comments on Ad Posts**." Important for a management app: organic-post comments always notify; boosted/dark-post *creation* does not, but comments on them do.

**Sources:**
- https://developers.facebook.com/docs/graph-api/webhooks/reference/page/  (schema table — item/verb/value fields)
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started  (envelope)
- (full JSON examples no longer published by Meta; values above are representative — see defect note)

---

## 6. Other FB Page fields — `mention`, `ratings`, Messenger

### 6a. `mention` (`field: "mention"`)

"Describes new mentions of a page, including mentions in comments, posts, etc." `VERBATIM` value schema:

`from{ id, name }` (only for Workplace), `link`, `message`, `message_tags[]{ id, length, name, offset, type(enum{user,page,event,group,application}) }`, `photo`, `photos[]`, `post_id`, `video`, plus the same standard action fields as `feed`: `action`, `album_id`, `comment_id`, `created_time`, `event_id`, `item` (enum), `open_graph_story_id`, `parent_id`, `photo_id`, `reaction_type`, `published`, `recipient_id`, `share_id`, `verb` (enum), `video_id`.

`REPRESENTATIVE`:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1520383571,
      "changes": [
        {
          "field": "mention",
          "value": {
            "post_id": "<POST_ID>",
            "verb": "add",
            "item": "post",
            "sender_name": "Someone Who Mentioned Us",
            "sender_id": "<USER_ID>",
            "created_time": 1520383571,
            "message": "shout-out to @MyPage!"
          }
        }
      ]
    }
  ]
}
```
> Note the `mention` value mixes conventions: the schema documents `from{id,name}` (Workplace) yet real public-Page mention payloads commonly surface `sender_id`/`sender_name`. Same ambiguity as §5c.

### 6b. `ratings` (`field: "ratings"`) — reviews / recommendations

"Describes changes to a page's ratings…" `VERBATIM` value schema:

`comment_id`, `created_time`, `item` (enum), `message`, `open_graph_story_id`, `parent_id`, `photo`, `post_id`, `rating` (int32 star rating), `review_text` (string or null), `reaction_type`, `recommendation_type` (enum `"positive"`/`"negative"`), `reviewer_id`, `reviewer_name`, `sender_id`, `sender_name`, `verb` (enum §5b).

`REPRESENTATIVE`:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1520383571,
      "changes": [
        {
          "field": "ratings",
          "value": {
            "verb": "add",
            "item": "rating",
            "rating": 5,
            "review_text": "Great service",
            "recommendation_type": "positive",
            "reviewer_id": "<USER_ID>",
            "reviewer_name": "Happy Customer",
            "open_graph_story_id": "<OG_STORY_ID>",
            "created_time": 1520383571
          }
        }
      ]
    }
  ]
}
```
> Modern FB "reviews" are recommendations, so `rating` may be absent and `recommendation_type` present instead. `ratings` is the field that **canonically uses `sender_id`/`sender_name`** — evidence the platform is internally inconsistent about sender naming across fields.

### 6c. Messenger fields (out of scope for Scheduly, documented for completeness)

Under `object:"page"`, Messenger events arrive in **`entry[].messaging[]`** (not `changes[]`). Relevant subscribable fields: `messages`, `messaging_postbacks`, `message_reactions`, `message_reads`/`messaging_seen`, `message_edits`, `messaging_optins`, `messaging_referrals`, `messaging_handovers`, `standby`, `messaging_account_linking`, `messaging_policy_enforcement`.

`REPRESENTATIVE` Messenger message:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1520383571,
      "messaging": [
        {
          "sender": { "id": "<PSID>" },
          "recipient": { "id": "<PAGE_ID>" },
          "timestamp": 1520383571,
          "message": { "mid": "<MESSAGE_ID>", "text": "Hi!" }
        }
      ]
    }
  ]
}
```
> `VERBATIM` note from Getting Started: "The frequency with which **Messenger** event notifications are sent is different." Messenger has its own delivery cadence/limits.

**Source:** https://developers.facebook.com/docs/graph-api/webhooks/reference/page/

---

## 7. Instagram webhooks — the two shapes

`object: "instagram"`. Meta's **Instagram Platform Webhook Notification Examples** page is the authoritative source and explicitly documents **two envelope conventions** keyed by login model:

- **"Business Login for Instagram"** = **Instagram API with Instagram Login** (`graph.instagram.com`, standalone) → **FLAT** `entry[].field` + `entry[].value` for content events, and **`entry[].messaging[]`** for DMs.
- **"Facebook Login for Business"** = **Instagram Graph API via a linked Page** (`graph.facebook.com`) → nested **`entry[].changes[]`** `{field,value}`.

Both use `object:"instagram"` and `entry[]` with `id` (the IG account ID) + `time`.

### 7a. Available `instagram` fields

`comments`, `live_comments`, `mentions`, `story_insights`, `messages`, `message_reactions`, `message_edits`, `messaging_seen`, `messaging_postbacks`, `messaging_referral`, `messaging_optins`, `messaging_handover`, `standby`.

Availability by login model (from the field/permission table):
- **`story_insights`** — **Facebook Login only.**
- **`mentions`** — documented under the Facebook-Login (`changes[]`) examples; treated as FB-Login-oriented.
- **`message_echoes`** — one login model only.
- Messaging fields (`messages`, `message_reactions`, `messaging_postbacks`, …) exist under both, but with **different permissions**: Instagram-Login uses `instagram_business_manage_messages` / `instagram_business_manage_comments` / `instagram_business_basic`; Facebook-Login uses `instagram_manage_messages` / `instagram_manage_comments` / `instagram_manage_insights`.

### 7b. Instagram-Login (FLAT) — comment

`VERBATIM` (Meta's own template — **note the missing comma after `time`**, a doc typo, and that `field`/`value` sit **directly on the entry**, no `changes` wrapper):

```json
[
  {
    "object": "instagram",
    "entry": [
      {
        "id": "<YOUR_APP_USERS_INSTAGRAM_ACCOUNT_ID>",
        "time": <TIME_META_SENT_THIS_NOTIFICATION>
        "field": "comments",
        "value": {
          "id": "<COMMENT_ID>",
          "from": {
            "id": "<INSTAGRAM_SCOPED_USER_ID>",
            "username": "<USERNAME>"
          },
          "text": "<COMMENT_TEXT>",
          "media": {
            "id": "<MEDIA_ID>",
            "media_product_type": "<MEDIA_PRODUCT_TYPE>"
          }
        }
      }
    ]
  }
]
```

### 7c. Instagram-Login (FLAT) — DM (`messaging[]`)

`VERBATIM` skeleton:

```json
[
  {
    "object":"instagram",
    "entry":[
      {
        "id":"<YOUR_APP_USERS_INSTAGRAM_ACCOUNT_ID>",
        "time":<TIME_META_SENT_NOTIFICATION>,
        "messaging": [
          {
            "sender": { "id": "<SENDER_ID>" },
            "recipient": { "id": "<RECIPIENT_ID>" },
            "timestamp": <TIME_WEBHOOK_WAS_TRIGGERED>
            <NOTIFICATION_PAYLOAD>
          }
        ]
      }
    ]
  }
]
```

`VERBATIM` full message payload (Meta's raw template — **malformed**: missing commas + a duplicated `reply_to` block; preserved here so the defect is on record):

```json
{
  "message": {
    "mid": "<MESSAGE_ID>",
    "attachments": [
      { "type":"<ATTACHMENT_MEDIA_TYPE>", "payload":{ "url":"<URL_FOR_THE_MEDIA>" } }
    ],
    "is_deleted": true,
    "is_echo": true,
    "is_self": true,
    "is_unsupported": true,
    "quick_reply": { "payload": "<QUICK_REPLY_OPTION_SELECTED>" },
    "referral": {
      "ref": "<AD_REF_PARAMETER_VALUE_IF_SET>",
      "ad_id": "<AD_ID>",
      "source": "ADS",
      "type": "OPEN_THREAD",
      "ads_context_data": {
        "ad_title": "<AD_TITLE>",
        "photo_url": "<IMAGE_URL_THAT_WAS_SELECTED>",
        "video_url": "<THUMBNAIL_URL_FOR_THE_AD_VIDEO>"
      }
    },
    "reply_to": { "mid": "<MESSAGE_ID>" },
    "reply_to": { "story": { "url":"<CDN_URL_FOR_THE_STORY>", "id":"<STORY_ID>" } },
    "text": "<MESSAGE_TEXT>"
  }
}
```
(Cleaned reading: a message has `mid`, optional `text`, optional `attachments[]`, boolean flags `is_deleted`/`is_echo`/`is_self`/`is_unsupported`, optional `quick_reply`, optional `referral`, and **either** `reply_to.mid` (reply to a message) **or** `reply_to.story` (reply to a story). `is_self:true` is the self-test message Meta sends when you first wire up the webhook.)

Other Instagram-Login `messaging[]` payload variants (`VERBATIM`, these ones are well-formed):

**message_reactions:**
```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "<YOUR_APP_USERS_INSTAGRAM_USER_ID>",
      "time": 1569262486134,
      "messaging": [
        {
          "sender": { "id": "<INSTAGRAM_SCOPED_ID>" },
          "recipient": { "id": "<YOUR_APP_USERS_INSTAGRAM_USER_ID>" },
          "timestamp": 1569262485349,
          "reaction": {
            "mid": "<MESSAGE_ID>",
            "action": "react",
            "reaction": "love",
            "emoji": "❤️"
          }
        }
      ]
    }
  ]
}
```

**messaging_postbacks:**
```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "<INSTAGRAM_SCOPED_ID>",
      "time": 1502905976963,
      "messaging": [
        {
          "sender": { "id": "<INSTAGRAM_SCOPED_ID>" },
          "recipient": { "id": "<YOUR_APP_USERS_INSTAGRAM_USER_ID>" },
          "timestamp": 1502905976377,
          "postback": {
            "mid": "<MESSAGE_ID>",
            "title": "<USER_SELECTED_ICEBREAKER_OPTION_OR_CTA_BUTTON>",
            "payload": "<OPTION_OR_BUTTON_PAYLOAD>"
          }
        }
      ]
    }
  ]
}
```

**messaging_seen (read receipt):**
```json
{ "read": { "mid": "<MESSAGE_ID>" } }
```
**message_edit:**
```json
{ "message_edit": { "mid": "<MESSAGE_ID>", "text": "<USER_EDITED_MESSAGE>", "num_edit": "<NUMBER_OF_TIMES_MESSAGE_IS_EDITED>" } }
```
**messaging_referral:** `{ "referral": { "ref": "...", "source": "<IGME_SOURCE_LINK>", "type": "OPEN_THREAD" } }`

### 7d. Facebook-Login IG — generic + comment (`changes[]`)

`VERBATIM` generic:
```json
[
  {
    "object": "instagram",
    "entry": [
      {
        "id": "<YOUR_APP_USERS_INSTAGRAM_ACCOUNT_ID>",
        "time": <TIME_META_SENT_THIS_NOTIFICATION>
        "changes": [
          {
            "field": "<WEBHOOK_FIELD>",
            "value": {
              <NOTIFICATION_PAYLOAD>
            }
          }
        ]
      }
    ]
  }
]
```

`VERBATIM` **comment** (richer than the flat form — has `comment_id`, `parent_id`, and ad-context media fields; the stray `}'` after `username` is a Meta doc typo):

```json
[
  {
    "object": "instagram",
    "entry": [
      {
        "id": "<YOUR_APP_USERS_INSTAGRAM_ACCOUNT_ID>",
        "time": <TIME_META_SENT_THIS_NOTIFICATION>
        "changes": [
          {
            "field": "comments",
            "value": {
              "from": {
                "id": "<INSTAGRAM_USER_SCOPED_ID>",
                "username": "<INSTAGRAM_USER_USERNAME>"
              }',
              "comment_id": "<COMMENT_ID>",
              "parent_id": "<PARENT_COMMENT_ID>",
              "text": "<TEXT_ID>",
              "media": {
                "id": "<MEDIA_ID>",
                "ad_id": "<AD_ID>",
                "ad_title": "<AD_TITLE_ID>",
                "original_media_id": "<ORIGINAL_MEDIA_ID>",
                "media_product_type": "<MEDIA_PRODUCT_ID>"
              }
            }
          }
        ]
      }
    ]
  }
]
```
`live_comments` is byte-identical except `"field": "live_comments"`.

### 7e. `mentions` (Facebook-Login, `changes[]`)

Mention **on media** (`VERBATIM`):
```json
[
  {
    "entry": [
      {
        "changes": [
          {
            "field": "mentions",
            "value": { "media_id": "17918195224117851" }
          }
        ],
        "id": "17841405726653026",
        "time": 1520622968
      }
    ],
    "object": "instagram"
  }
]
```
Mention **in a comment** (`VERBATIM`) — adds `comment_id`:
```json
[
  {
    "entry": [
      {
        "changes": [
          {
            "field": "mentions",
            "value": {
              "comment_id": "17894227972186120",
              "media_id": "17918195224117851"
            }
          }
        ],
        "id": "17841405726653026",
        "time": 1520622968
      }
    ],
    "object": "instagram"
  }
]
```
> `mentions` payloads are **thin** — just IDs. To get the actual text you must call the Graph API (`GET /{ig-user-id}?fields=mentioned_comment/mentioned_media`).

### 7f. `story_insights` (Facebook-Login only)

`changes[].field:"story_insights"`, value: `media_id`, `impressions`, `reach`, `taps_forward`, `taps_back`, `exits`, `replies`. **Metrics under 5 are shown as `-1`** (privacy floor). Fires when a story expires (~24 h). `REPRESENTATIVE`:
```json
{
  "field": "story_insights",
  "value": {
    "media_id": "17887498072083520",
    "impressions": 444,
    "reach": 396,
    "taps_forward": 200,
    "taps_back": 100,
    "exits": 40,
    "replies": 0
  }
}
```

> **MAJOR AMBIGUITY (flagged) — flat vs `changes[]` under Instagram Login.** Meta's examples page shows Instagram-Login **content** events (`comments`) as **flat** `entry[].field`/`entry[].value`, while Facebook-Login uses `entry[].changes[]`. BUT: (a) Meta's flat template has a **syntax error** (missing comma after `time`), so it can't be trusted literally; (b) a large body of real-world reports show **Instagram-Login comment webhooks arriving with a `changes[]` wrapper too**. The honest conclusion for the SDK: **do not hard-code one shape.** Parse each `entry` defensively as: `entry.changes?` → `{field,value}[]`; else `entry.messaging?` → messaging[]; else flat `entry.field`+`entry.value`. Normalize all three into one internal event type. This is the single most important robustness finding in this document.

**Sources:**
- https://developers.facebook.com/docs/instagram-platform/webhooks/examples/  (all IG-Login + FB-Login JSON above)
- https://developers.facebook.com/docs/instagram-platform/webhooks  (fields, subscribed_apps, login-model split)
- https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram  (field list incl. story_insights `-1` floor)
- https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/  (IG messaging)

---

## 8. Delivery semantics

All `VERBATIM` from Getting Started unless noted:

- **Respond fast, respond 200.** "Your endpoint should respond to all Event Notifications with `200 OK HTTPS`." Practical target: **return 200 within a couple of seconds** and do heavy work afterward. (Meta doesn't publish an exact timeout number on this page; the ecosystem-observed budget is a few seconds — the repo's handler already sends 200 first, then processes.)
- **Batching / multiplicity.** "Event Notifications are aggregated and sent in a batch with a **maximum of 1000 updates**. However **batching cannot be guaranteed** so be sure to adjust your servers to handle each Webhook individually." → **Yes, one POST can contain many `entry[]`** (different objects of the same type) **and many `changes[]`** per entry. The SDK must loop both dimensions.
- **Retry / backoff.** "If any update sent to your server fails, we will **retry immediately, then try a few more times with decreasing frequency over the next 36 hours**. Your server should handle **deduplication** in these cases. **Unacknowledged responses will be dropped after 36 hours**." → at-least-once; failures (non-2xx, timeout, TLS error) are retried for 36 h then dropped.
- **Deduplication is the receiver's job.** Meta explicitly pushes dedup onto you. There is **no delivery-id header** dedicated to idempotency; dedup on a natural key (e.g. `comment_id + verb + created_time`, or `mid`).
- **Ordering.** Meta does **not** document any ordering guarantee. Combined with retries + batching, treat the stream as **unordered**. (This is exactly why the repo's store uses `ZADD … GT` / newest-timestamp-wins so a late/duplicate delivery can't move a post's last-activity time backwards.)
- **No historical replay.** "You will **not** be able to query historical webhook event notification data, so be sure to capture and store any webhook payload content that you want to keep." If your endpoint is down past 36 h, those events are gone — reconcile via REST polling.
- **`time` is send-time, not event-time.** Use `value.created_time` for the actual event instant; `entry.time` is when Meta dispatched the notification.
- **Messenger differs.** DM/Messenger cadence and limits are governed by the Messenger docs, not this page.

**Source:** https://developers.facebook.com/docs/graph-api/webhooks/getting-started

---

## 9. Version notes (v22–v25, 2024–2026)

- **Current version: v25.0** (the app-subscriptions edge and reference now render under `/reference/v25.0/…`). Webhook envelope + verification + signature mechanics are **unchanged** across v22→v25.
- **Instagram API consolidation / decoupling (2024–2025).** Meta split Instagram into two products:
  - **Instagram API with Instagram Login** — standalone, `graph.instagram.com`, IG-User tokens, **no Facebook Page required**. Webhooks: **flat `field`/`value`** for content + **`messaging[]`** for DMs. (This is the model the repo moved to in the 2026-07-03 `createInstagramSdk` decoupling.)
  - **Instagram API with Facebook Login** (formerly "Instagram Graph API") — via a linked Page, `graph.facebook.com`. Webhooks: **`changes[]`**.
  This split is the direct cause of the two-shape divergence in §7.
- **`X-Hub-Signature` (SHA1) de-emphasized.** Current Getting Started documents **only** `X-Hub-Signature-256`. SHA1 is legacy; don't require it.
- **`story_insights` restricted** to Facebook-Login IG; the `-1` floor for metrics < 5 remains.
- **New IG comment `value` fields** (`from{id,username}`, `media.media_product_type`, `parent_id`, ad-context `media.ad_id`/`ad_title`/`original_media_id`) were added to the comments webhook (see restfb issue #1202 tracking Meta's changelog) — relatively recent additions a strict type must include as optional.
- **mTLS CA rotation:** `meta-outbound-api-ca-2025-12.pem` replaced the DigiCert CA that expired **2026-04-15** (WhatsApp-centric; noted for completeness).
- **Graph API `feed` full-JSON examples removed.** The archived `/webhooks/v2.5` example page now redirects to Getting Started; Meta only ships the schema table for `feed` now (see §5 defect).

**Sources:** https://developers.facebook.com/docs/graph-api/reference/v25.0/app/subscriptions · https://developers.facebook.com/docs/instagram-platform/webhooks · https://github.com/restfb/restfb/issues/1202

---

## 10. Ambiguities & doc-quality defects (consolidated)

For the SDK author — every place Meta's docs are thin, self-contradictory, or buggy:

1. **IG-Login envelope: flat vs `changes[]`.** (§7g) Docs say flat for content; real deliveries also show `changes[]`; the flat template is itself malformed. **Parse all three of `changes[]` / `messaging[]` / flat `field`+`value` defensively.** ← most important.
2. **`from{id,name}` vs `sender_id`/`sender_name`.** (§5c, §6) `feed` schema says `from`; `ratings` uses `sender_*`; historical `feed`/`mention` payloads used `sender_*`. Model both, normalize.
3. **`verb` enum has near-duplicates** `edit`/`edited` and `delete`/`remove`. (§5b) Runtime uses `edited`/`remove` on `feed`. Include all, expect the `-ed` forms.
4. **App-subscription `object` enum is stale** — lists only `{user, page, permissions, payments}`, omits `instagram`, `application`, `whatsapp_business_account`. (§1a) Don't derive the object union from it.
5. **Meta doc JSON typos** preserved on record: missing comma after `time` in the IG-Login flat comment template; stray `}'` after `username` in the FB-Login comment example; duplicated `reply_to` key + missing commas in the IG message template. (§7) Don't copy these verbatim into fixtures — hand-fix.
6. **No documented response timeout number** — only "respond with 200"; the "few seconds" budget is ecosystem lore, not a doc guarantee. (§8)
7. **No ordering guarantee and no idempotency key** are documented; both are implied. Dedup + newest-wins is on you. (§8)
8. **Raw-body requirement is understated.** Meta says "using the payload"; it means the *raw bytes*. Easy to get wrong; #1 signature-mismatch cause. (§3)
9. **`mentions` / `story_insights` payloads are ID-only / metric-only** — no author text; requires a follow-up Graph read to be useful. (§7e/§7f)

---

## 11. Relevant-to-Scheduly summary

Scheduly = **scheduling + engagement** for FB Pages and IG professional accounts. What the webhook layer actually needs vs. what to type-but-ignore:

### IN SCOPE — model fully, wire to handlers

| `object` | field | branch | why Scheduly needs it |
|---|---|---|---|
| `page` | `feed` (`item:"comment"`, `verb:add/edited/remove/hide/unhide`) | `changes[]` | Core engagement: surface/moderate comments on the Page's posts. (Repo already records `feed`+`comment`+`add` → active-post store.) |
| `page` | `feed` (`item:"post"/"status"/"photo"/"video"`, `verb:add`) | `changes[]` | Confirm scheduled posts published; detect organic posts to track. |
| `page` | `feed` (`item:"reaction"`, `verb:add/remove`) | `changes[]` | Engagement metrics on posts/comments. |
| `page` | `mention` | `changes[]` | Brand-monitoring: someone @-mentioned the Page. |
| `page` | `ratings` | `changes[]` | New reviews/recommendations to respond to. |
| `instagram` | `comments` | flat **or** `changes[]` | IG comment moderation/engagement — the IG analog of `feed` comments. Handle **both** login shapes. |
| `instagram` | `mentions` | `changes[]` (FB-Login) | IG @-mentions of the account (ID-only → follow-up read). |

### OUT OF SCOPE for v1 — but typed so payloads are captured, not dropped

| `object` | field | branch | note |
|---|---|---|---|
| `page` | `messages`, `messaging_postbacks`, `message_reactions`, … | `messaging[]` | Messenger DMs — Scheduly isn't an inbox (yet). Parse-and-ignore. |
| `instagram` | `messages`, `message_reactions`, `messaging_seen`, `messaging_postbacks`, `messaging_referral`, `message_edits` | `messaging[]` | IG DMs — same reasoning. |
| `instagram` | `live_comments` | flat/`changes[]` | Only meaningful during a live broadcast; niche. |
| `instagram` | `story_insights` | `changes[]` (FB-Login only) | Story analytics on expiry; metrics-only, `-1` floor. Nice-to-have later. |

### Minimum viable typed surface

- **Verification:** GET `hub.mode`/`hub.challenge`/`hub.verify_token` (accept dotted **and** underscored keys) → echo `hub.challenge` as 200 text. (§2)
- **Security:** verify `X-Hub-Signature-256` = `HMAC-SHA256(appSecret, rawBody)`, constant-time; SHA1 fallback optional. (§3)
- **Envelope:** discriminated union on `entry.changes` (`{field,value}[]`) vs `entry.messaging` (`[]`) vs flat `entry.field`+`entry.value`; loop **both** `entry[]` and `changes[]`. (§4, §7g)
- **Semantics:** send 200 first / process after; at-least-once → dedup on a natural key; unordered → newest-`created_time`-wins; no historical replay → keep a REST reconcile path. (§8)

---

*End of research. All JSON marked `VERBATIM` was extracted from the live v25.0 docs on 2026-07-05 (rendered via headless browser, since the pages are client-rendered and un-scrapable by plain HTTP). All JSON marked `REPRESENTATIVE` was reconstructed from Meta's verbatim field schema plus the canonical shape, because Meta no longer publishes full `feed` example payloads.*
