import { createHmac } from "crypto";
import type { CommentStore } from "../store/types.js";

// ─── Webhook Payload Types ───

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

// ─── Minimal req/res interfaces (framework-agnostic) ───

interface VerifyRequest {
  query: Record<string, string | string[] | undefined>;
}

interface EventRequest {
  body: WebhookPayload;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer | string;
}

interface Response {
  status(code: number): Response;
  send(body: string): void;
  sendStatus?(code: number): void;
}

// ─── Handler Config ───

export interface WebhookHandlerConfig {
  store: CommentStore;
  verifyToken: string;
  appSecret: string;
}

function verifySignature(
  appSecret: string,
  rawBody: string | Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return signature === expected;
}

/**
 * Creates a webhook handler that parses Facebook Page feed webhooks
 * and records comment activity in a CommentStore.
 */
export function createWebhookHandler(config: WebhookHandlerConfig) {
  const { store, verifyToken, appSecret } = config;

  const handleVerify = (req: VerifyRequest, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(String(challenge));
    } else {
      res.status(403).send("Forbidden");
    }
  };

  const handleEvent = async (req: EventRequest, res: Response) => {
    // Verify signature
    const signature = req.headers["x-hub-signature-256"];
    const rawBody =
      req.rawBody ?? (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const sig = Array.isArray(signature) ? signature[0] : signature;

    if (!verifySignature(appSecret, rawBody, sig)) {
      res.status(403).send("Invalid signature");
      return;
    }

    // Respond 200 immediately — Facebook requires fast response
    res.status(200).send("EVENT_RECEIVED");

    // Process entries in background
    const payload = req.body;
    if (payload.object !== "page") return;

    const promises: Promise<void>[] = [];

    for (const entry of payload.entry) {
      const pageId = entry.id;
      for (const change of entry.changes) {
        if (change.field !== "feed") continue;
        const { value } = change;
        if (value.item === "comment" && value.verb === "add" && value.post_id) {
          promises.push(
            store.recordActivity(pageId, value.post_id, value.created_time),
          );
        }
      }
    }

    await Promise.all(promises);
  };

  return { handleVerify, handleEvent };
}
