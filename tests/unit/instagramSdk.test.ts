import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture the base URL each request goes out on, so we can prove host routing
// regardless of the per-host axios-instance cache in httpClient.
const { requestCalls } = vi.hoisted(() => ({
  requestCalls: [] as { baseURL?: string | undefined; path: string }[],
}));

vi.mock("axios", () => {
  const create = (cfg?: { baseURL?: string }) => {
    const baseURL = cfg?.baseURL;
    const handler = async (path: string) => {
      requestCalls.push({ baseURL, path });
      return { data: { id: "ig-1", username: "me" }, status: 200 };
    };
    return { get: handler, post: handler, delete: handler };
  };
  return { default: { create }, isAxiosError: () => false };
});

import { createInstagramSdk } from "../../src/instagramClient.js";
import { createFbSdk } from "../../src/client.js";
import { GRAPH_HOSTS } from "../../src/httpClient.js";

beforeEach(() => {
  requestCalls.length = 0;
});

describe("createInstagramSdk", () => {
  it("exposes bare account/media/comment accessors + http", () => {
    const ig = createInstagramSdk()("ig-token");
    expect(typeof ig.account).toBe("function");
    expect(typeof ig.media).toBe("function");
    expect(typeof ig.comment).toBe("function");
    expect(typeof ig.http.getToken).toBe("function");
  });

  it("routes requests to graph.instagram.com carrying the IG token", async () => {
    const ig = createInstagramSdk()("ig-token");
    await ig.account("ig-1").get({ id: true, username: true });

    const call = requestCalls.find((c) => c.path === "/ig-1");
    expect(call?.baseURL).toBe(GRAPH_HOSTS.instagram);
    expect(call?.baseURL).not.toBe(GRAPH_HOSTS.facebook);
    expect(ig.http.getToken()).toBe("ig-token");
  });
});

describe("createFbSdk is Facebook-only after decoupling", () => {
  it("no longer exposes any Instagram accessors", () => {
    const fb = createFbSdk()("fb-token") as Record<string, unknown>;
    expect(fb["instagram"]).toBeUndefined();
    expect(fb["instagramMedia"]).toBeUndefined();
    expect(fb["instagramComment"]).toBeUndefined();
    expect(typeof fb["page"]).toBe("function");
  });
});
