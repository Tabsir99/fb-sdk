import { createHmac, timingSafeEqual } from "crypto";
import type { Store } from "../store/types.js";
import { type WebhookPayload } from "../types/webhook.js";

// ─── Webhook Payload Types ───

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
  store: Store;
  verifyToken: string;
  appSecret: string;
  /**
   * Called for failures during background processing (store writes, malformed
   * entries) — these happen after the 200 response and would otherwise be
   * unhandled rejections. Defaults to swallowing silently.
   */
  onError?: (error: unknown) => void;
}

function verifySignature(
  appSecret: string,
  rawBody: string | Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

/**
 * Creates a webhook handler that parses Facebook Page feed webhooks
 * and records comment activity in a CommentStore.
 */
export function createWebhookHandler(config: WebhookHandlerConfig) {
  const { store, verifyToken, appSecret, onError } = config;

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

    // Process entries in background. The response is already sent, so nothing
    // here may throw out of the handler — report via onError instead.
    try {
      const payload = req.body;
      if (payload.object !== "page") return;

      const writes: Promise<void>[] = [];

      for (const entry of payload.entry ?? []) {
        const pageId = entry.id;
        // Entries from other subscription types (e.g. messaging) have no changes array.
        for (const change of entry.changes ?? []) {
          if (change.field !== "feed") continue;
          const { value } = change;
          if (value.item === "comment" && value.verb === "add" && value.post_id) {
            writes.push(store.recordActivity(pageId, value.post_id, value.created_time));
          }
        }
      }

      const results = await Promise.allSettled(writes);
      for (const result of results) {
        if (result.status === "rejected") onError?.(result.reason);
      }
    } catch (error) {
      onError?.(error);
    }
  };

  return { handleVerify, handleEvent };
}
