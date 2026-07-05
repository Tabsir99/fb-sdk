import { createHmac, timingSafeEqual } from "crypto";
import type { Store } from "../store/types.js";
import { type WebhookEvent, type WebhookPayload } from "../types/webhook.js";
import { normalizePayload } from "./normalize.js";

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

/** Options for {@link createWebhookHandler}. */
export interface WebhookHandlerConfig {
  /** Token echoed back during Meta's GET verification handshake; must match `hub.verify_token`. */
  verifyToken: string;
  /** App secret used to validate the `X-Hub-Signature-256` HMAC on event POSTs. */
  appSecret: string;
  /**
   * Called once per normalized event, after the 200 response. Switch on
   * `event.type` and narrow on `event.platform`. Runs in the background —
   * throwing routes to `onError` and never affects the HTTP response.
   */
  onEvent?: (event: WebhookEvent) => void | Promise<void>;
  /**
   * Optional active-post store. When provided, Facebook Page comment-adds are
   * recorded automatically (built-in behavior) so `page(id).comments.list({ since })`
   * can target recently-active posts. Independent of `onEvent`.
   */
  store?: Store;
  /**
   * Called for failures during background processing (store writes, `onEvent`
   * throws) — these happen after the 200 and would otherwise be unhandled
   * rejections. Defaults to swallowing silently.
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
 * Creates a webhook handler that verifies Meta's signature, parses Facebook and
 * Instagram webhooks into a normalized event stream, and dispatches each event
 * to `onEvent`. If a `store` is supplied, Facebook Page comment activity is also
 * recorded automatically (the legacy targeted-comment-fetch behavior).
 */
export function createWebhookHandler(config: WebhookHandlerConfig) {
  const { store, verifyToken, appSecret, onEvent, onError } = config;

  /** GET handler for Meta's verification handshake: echoes `hub.challenge` when the token matches, else 403. */
  const handleVerify = (req: VerifyRequest, res: Response) => {
    const q = req.query;
    // Some frameworks (e.g. PHP) deliver `hub_mode` instead of `hub.mode` — accept both.
    const mode = q["hub.mode"] ?? q["hub_mode"];
    const token = q["hub.verify_token"] ?? q["hub_verify_token"];
    const challenge = q["hub.challenge"] ?? q["hub_challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(String(challenge));
    } else {
      res.status(403).send("Forbidden");
    }
  };

  /** POST handler for event notifications: verifies the signature, acks 200, then dispatches normalized events in the background. */
  const handleEvent = async (req: EventRequest, res: Response) => {
    const signature = req.headers["x-hub-signature-256"];
    const rawBody =
      req.rawBody ?? (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const sig = Array.isArray(signature) ? signature[0] : signature;

    if (!verifySignature(appSecret, rawBody, sig)) {
      res.status(403).send("Invalid signature");
      return;
    }

    // Respond 200 immediately — Meta requires a fast ack and retries otherwise.
    res.status(200).send("EVENT_RECEIVED");

    // Response already sent; run in the background and surface failures via onError.
    try {
      const events = normalizePayload(req.body);
      const tasks: Promise<unknown>[] = [];

      for (const event of events) {
        // Built-in behavior: record FB Page comment-adds for targeted fetching.
        if (
          store &&
          event.type === "comment.added" &&
          event.platform === "facebook" &&
          event.postId
        ) {
          tasks.push(store.recordActivity(event.accountId, event.postId, event.createdTime ?? event.time));
        }
        // Consumer dispatch — wrapped so a synchronous throw is caught too.
        if (onEvent) tasks.push(Promise.resolve().then(() => onEvent(event)));
      }

      const results = await Promise.allSettled(tasks);
      for (const result of results) {
        if (result.status === "rejected") onError?.(result.reason);
      }
    } catch (error) {
      onError?.(error);
    }
  };

  return { handleVerify, handleEvent };
}
