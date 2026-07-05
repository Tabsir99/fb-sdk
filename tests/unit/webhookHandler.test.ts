import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";
import { createWebhookHandler } from "../../src/webhook/handler.js";
import type { Store } from "../../src/store/types.js";
import type { WebhookEvent, WebhookPayload } from "../../src/types/webhook.js";

const APP_SECRET = "shhh-secret";
const VERIFY_TOKEN = "verify-me";

function sign(rawBody: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
}

function createMockStore(overrides?: Partial<Store>): Store {
  return {
    recordActivity: vi.fn().mockResolvedValue(undefined),
    getActivePosts: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    statusCode: 0,
    body: "",
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(body: string) {
      res.body = body;
    },
  };
  return res;
}

const commentPayload: WebhookPayload = {
  object: "page",
  entry: [
    {
      id: "page1",
      time: 1000,
      changes: [
        {
          field: "feed",
          value: {
            item: "comment",
            verb: "add",
            comment_id: "c1",
            post_id: "post1",
            parent_id: "post1",
            created_time: 1234,
          },
        },
      ],
    },
  ],
};

function eventRequest(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  return {
    body: payload as WebhookPayload,
    rawBody,
    headers: { "x-hub-signature-256": sign(rawBody) },
  };
}

describe("createWebhookHandler", () => {
  describe("handleVerify", () => {
    it("echoes the challenge for a valid subscribe request", () => {
      const handler = createWebhookHandler({
        store: createMockStore(),
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
      });
      const res = createMockRes();

      handler.handleVerify(
        { query: { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "42" } },
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("42");
    });

    it("rejects a wrong verify token with 403", () => {
      const handler = createWebhookHandler({
        store: createMockStore(),
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
      });
      const res = createMockRes();

      handler.handleVerify(
        { query: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42" } },
        res,
      );

      expect(res.statusCode).toBe(403);
    });
  });

  describe("handleEvent", () => {
    it("records comment-add activity for a correctly signed payload", async () => {
      const store = createMockStore();
      const handler = createWebhookHandler({ store, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const res = createMockRes();

      await handler.handleEvent(eventRequest(commentPayload), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("EVENT_RECEIVED");
      expect(store.recordActivity).toHaveBeenCalledTimes(1);
      expect(store.recordActivity).toHaveBeenCalledWith("page1", "post1", 1234);
    });

    it("rejects a bad signature with 403 and never touches the store", async () => {
      const store = createMockStore();
      const handler = createWebhookHandler({ store, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const res = createMockRes();

      const req = eventRequest(commentPayload);
      req.headers["x-hub-signature-256"] = "sha256=" + "0".repeat(64);

      await handler.handleEvent(req, res);

      expect(res.statusCode).toBe(403);
      expect(store.recordActivity).not.toHaveBeenCalled();
    });

    it("rejects a missing signature with 403", async () => {
      const store = createMockStore();
      const handler = createWebhookHandler({ store, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const res = createMockRes();

      const req = eventRequest(commentPayload);
      delete (req.headers as Record<string, unknown>)["x-hub-signature-256"];

      await handler.handleEvent(req, res);

      expect(res.statusCode).toBe(403);
    });

    it("tolerates entries without a changes array (other subscription types)", async () => {
      const store = createMockStore();
      const handler = createWebhookHandler({ store, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const res = createMockRes();

      const payload = { object: "page", entry: [{ id: "page1", time: 1, messaging: [{}] }] };

      await expect(handler.handleEvent(eventRequest(payload), res)).resolves.toBeUndefined();
      expect(res.statusCode).toBe(200);
      expect(store.recordActivity).not.toHaveBeenCalled();
    });

    it("reports store failures via onError instead of rejecting after the 200", async () => {
      const failure = new Error("redis down");
      const store = createMockStore({ recordActivity: vi.fn().mockRejectedValue(failure) });
      const onError = vi.fn();
      const handler = createWebhookHandler({
        store,
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onError,
      });
      const res = createMockRes();

      await expect(handler.handleEvent(eventRequest(commentPayload), res)).resolves.toBeUndefined();

      expect(res.statusCode).toBe(200);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(failure);
    });

    it("ignores non-page payloads", async () => {
      const store = createMockStore();
      const handler = createWebhookHandler({ store, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const res = createMockRes();

      await handler.handleEvent(eventRequest({ object: "user", entry: [] }), res);

      expect(res.statusCode).toBe(200);
      expect(store.recordActivity).not.toHaveBeenCalled();
    });
  });

  describe("onEvent dispatch", () => {
    it("dispatches a normalized facebook comment.added event", async () => {
      const events: WebhookEvent[] = [];
      const handler = createWebhookHandler({
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onEvent: (e) => {
          events.push(e);
        },
      });
      const res = createMockRes();

      await handler.handleEvent(eventRequest(commentPayload), res);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "comment.added",
        platform: "facebook",
        accountId: "page1",
        commentId: "c1",
        postId: "post1",
        parentId: "post1",
        createdTime: 1234,
      });
    });

    it("runs the built-in store recorder and onEvent together", async () => {
      const store = createMockStore();
      const events: WebhookEvent[] = [];
      const handler = createWebhookHandler({
        store,
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onEvent: (e) => {
          events.push(e);
        },
      });
      const res = createMockRes();

      await handler.handleEvent(eventRequest(commentPayload), res);

      expect(store.recordActivity).toHaveBeenCalledWith("page1", "post1", 1234);
      expect(events.map((e) => e.type)).toEqual(["comment.added"]);
    });

    it("routes an onEvent throw to onError without affecting the 200", async () => {
      const boom = new Error("handler boom");
      const onError = vi.fn();
      const handler = createWebhookHandler({
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onEvent: () => {
          throw boom;
        },
        onError,
      });
      const res = createMockRes();

      await handler.handleEvent(eventRequest(commentPayload), res);

      expect(res.statusCode).toBe(200);
      expect(onError).toHaveBeenCalledWith(boom);
    });
  });

  describe("instagram normalization (both login shapes)", () => {
    const igFlatComment = {
      object: "instagram",
      entry: [
        {
          id: "ig1",
          time: 2000,
          field: "comments",
          value: {
            id: "igc1",
            from: { id: "u1", username: "fan" },
            text: "fire",
            media: { id: "m1", media_product_type: "FEED" },
          },
        },
      ],
    };

    const igChangesComment = {
      object: "instagram",
      entry: [
        {
          id: "ig1",
          time: 2001,
          changes: [
            {
              field: "comments",
              value: {
                comment_id: "igc2",
                parent_id: "p1",
                from: { id: "u2", username: "buyer" },
                text: "price?",
                media: { id: "m2" },
              },
            },
          ],
        },
      ],
    };

    it("normalizes a flat Instagram-Login comment and leaves the FB store untouched", async () => {
      const store = createMockStore();
      const events: WebhookEvent[] = [];
      const handler = createWebhookHandler({
        store,
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onEvent: (e) => {
          events.push(e);
        },
      });
      const res = createMockRes();

      await handler.handleEvent(eventRequest(igFlatComment), res);

      expect(store.recordActivity).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e).toMatchObject({
        type: "comment.added",
        platform: "instagram",
        accountId: "ig1",
        commentId: "igc1",
        mediaId: "m1",
        text: "fire",
      });
      if (e?.type === "comment.added" && e.platform === "instagram") {
        expect(e.from).toEqual({ id: "u1", username: "fan" });
      }
    });

    it("normalizes an FB-Login Instagram comment (changes[] shape) identically", async () => {
      const events: WebhookEvent[] = [];
      const handler = createWebhookHandler({
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onEvent: (e) => {
          events.push(e);
        },
      });
      const res = createMockRes();

      await handler.handleEvent(eventRequest(igChangesComment), res);

      expect(events[0]).toMatchObject({
        type: "comment.added",
        platform: "instagram",
        commentId: "igc2",
        parentId: "p1",
        mediaId: "m2",
        text: "price?",
      });
    });

    it("captures unmodeled entries (DMs) as an unknown event rather than dropping them", async () => {
      const events: WebhookEvent[] = [];
      const handler = createWebhookHandler({
        verifyToken: VERIFY_TOKEN,
        appSecret: APP_SECRET,
        onEvent: (e) => {
          events.push(e);
        },
      });
      const res = createMockRes();
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "ig1",
            time: 3,
            messaging: [{ sender: { id: "s" }, recipient: { id: "r" }, timestamp: 1 }],
          },
        ],
      };

      await handler.handleEvent(eventRequest(payload), res);

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("unknown");
    });
  });
});
