import { describe, it, expect, vi } from "vitest";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { createHttpClient } from "../../src/httpClient.js";
import { createBatchResource } from "../../src/resources/createBatchResource.js";
import { createFbSdk } from "../../src/client.js";
import type { BatchSubResponse } from "../../src/types/shared.js";
import {
  FacebookAuthError,
  FacebookPermissionError,
  FacebookPolicyBlockError,
  FacebookRateLimitError,
  FacebookInvalidParamError,
  FacebookTransientError,
  FacebookUnknownError,
  FacebookNetworkError,
  FacebookGraphError,
  FacebookErrorBase,
  FacebookErrorCode,
  FacebookAuthSubcode,
  type FacebookError,
  type FacebookErrorContext,
} from "../../src/errors.js";

/**
 * The onError hook detects errors on the REAL axios pipeline. We inject an
 * adapter that returns the chosen HTTP status so transformResponse → unwrap →
 * (validateStatus throw) all run exactly as in production. Bodies are written
 * snake_case (as Facebook sends them) so we also prove the envelope is
 * key-camelized before it reaches the typed error.
 */

const TOKEN = "tok";

// A custom adapter is responsible for honoring validateStatus itself (axios only
// applies it inside its built-in adapters). So we mimic settle(): resolve on 2xx,
// otherwise reject with an AxiosError carrying the response — exactly what drives
// the production thrown path. In the rejection path axios still runs
// transformResponse on response.data, so the body is key-camelized as in prod.
function adapterReturning(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn((config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const response: AxiosResponse = {
      data: typeof body === "string" ? body : JSON.stringify(body),
      status,
      statusText: "",
      headers,
      config,
    };
    if (status >= 200 && status < 300) return Promise.resolve(response);
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response,
      ),
    );
  });
}

// An adapter whose transport fails outright (no HTTP response at all).
function throwingAdapter(error: unknown) {
  return vi.fn((): Promise<AxiosResponse> => Promise.reject(error));
}

function fbErrorBody(error: Record<string, unknown>) {
  return { error };
}

async function captureGetError(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Promise<FacebookError> {
  const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
  const http = createHttpClient(TOKEN, { onError });
  await expect(
    http.get("/x", { adapter: adapterReturning(status, body, headers) }),
  ).rejects.toThrow();
  expect(onError).toHaveBeenCalledTimes(1);
  const [err] = onError.mock.calls[0]!;
  return err;
}

describe("onError hook — direct requests", () => {
  it("classifies an expired access token (190/463) as a FacebookAuthError", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({
        message: "Error validating access token: Session has expired.",
        type: "OAuthException",
        code: 190,
        error_subcode: 463,
        fbtrace_id: "trace123",
      }),
    );

    expect(err).toBeInstanceOf(FacebookAuthError);
    expect(err).toBeInstanceOf(FacebookGraphError);
    expect(err).toBeInstanceOf(FacebookErrorBase);
    expect(err).toBeInstanceOf(Error);
    expect(err.category).toBe("auth");
    expect(err.httpStatus).toBe(400);
    expect(err.isTransient).toBe(false);
    if (err.category === "auth") {
      expect(err.code).toBe(FacebookErrorCode.ACCESS_TOKEN);
      expect(err.subcode).toBe(FacebookAuthSubcode.EXPIRED);
      expect(err.type).toBe("OAuthException");
      expect(err.traceId).toBe("trace123");
      // raw is the SDK-camelized envelope (error_subcode → errorSubcode) and the escape hatch.
      expect(err.raw.code).toBe(190);
      expect(err.raw.errorSubcode).toBe(463);
      expect(err.raw.fbtraceId).toBe("trace123");
    }
  });

  it("special-cases 190 subcode 492 as permission, not auth", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({ message: "Bad page role", type: "OAuthException", code: 190, error_subcode: 492 }),
    );
    expect(err).toBeInstanceOf(FacebookPermissionError);
    expect(err.category).toBe("permission");
  });

  it("surfaces end-user-safe fields when Facebook provides them", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({
        message: "internal detail",
        type: "OAuthException",
        code: 10,
        error_user_title: "Permission needed",
        error_user_msg: "Please grant access to continue.",
      }),
    );
    expect(err).toBeInstanceOf(FacebookPermissionError);
    if (err.category === "permission") {
      expect(err.userTitle).toBe("Permission needed");
      expect(err.userMessage).toBe("Please grant access to continue.");
    }
  });

  it("re-throws the original error after reporting (observational only)", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    await expect(
      http.get("/x", {
        adapter: adapterReturning(400, fbErrorBody({ message: "x", type: "T", code: 100 })),
      }),
    ).rejects.toMatchObject({ isAxiosError: true });
  });

  it("does not fire on a clean 2xx response", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    const data = await http.get("/x", { adapter: adapterReturning(200, { id: "1" }) });
    expect(data).toEqual({ id: "1" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("fires on a 2xx body that nonetheless carries an error envelope", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    await http.get("/x", {
      adapter: adapterReturning(200, fbErrorBody({ message: "soft", type: "T", code: 100 })),
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(FacebookInvalidParamError);
  });

  it("reports POST failures too", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    await expect(
      http.post("/x", { message: "hi" }, {
        adapter: adapterReturning(400, fbErrorBody({ message: "dup", type: "OAuthException", code: 506 })),
      }),
    ).rejects.toThrow();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(FacebookInvalidParamError);
  });

  it("is wired through createFbSdk({ onError })", async () => {
    const errors: FacebookError[] = [];
    const sdk = createFbSdk({ onError: (e) => errors.push(e) })(TOKEN);
    await expect(
      sdk.http.get("/x", {
        adapter: adapterReturning(400, fbErrorBody({ message: "x", type: "OAuthException", code: 190 })),
      }),
    ).rejects.toThrow();
    expect(errors[0]).toBeInstanceOf(FacebookAuthError);
  });

  it("passes a context identifying the failing call (token-free relativeUrl)", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    await expect(
      http.get("/123/comments", {
        params: { fields: "id" },
        adapter: adapterReturning(400, fbErrorBody({ message: "x", type: "OAuthException", code: 190 })),
      }),
    ).rejects.toThrow();
    expect(onError.mock.calls[0]![1]).toEqual({
      method: "GET",
      relativeUrl: "123/comments?fields=id",
      accessToken: TOKEN,
      source: "request",
    });
  });

  it("carries each SDK instance's own token so multi-page apps can route the failure", async () => {
    const seen: string[] = [];
    const sdkA = createFbSdk({ onError: (_e, ctx) => seen.push(ctx.accessToken) })("token-A");
    const sdkB = createFbSdk({ onError: (_e, ctx) => seen.push(ctx.accessToken) })("token-B");
    const body = fbErrorBody({ message: "x", type: "OAuthException", code: 190 });

    await expect(sdkA.http.get("/me", { adapter: adapterReturning(400, body) })).rejects.toThrow();
    await expect(sdkB.http.get("/me", { adapter: adapterReturning(400, body) })).rejects.toThrow();

    expect(seen).toEqual(["token-A", "token-B"]);
  });
});

describe("onError hook — classification", () => {
  it("maps app-level throttling (code 4) to a rate-limit error and parses usage headers", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({ message: "throttled", type: "OAuthException", code: 4 }),
      {
        "x-app-usage": JSON.stringify({ call_count: 95, total_cputime: 20, total_time: 30 }),
        "x-business-use-case-usage": JSON.stringify({
          "1234": [{ type: "pages", call_count: 99, estimated_time_to_regain_access: 7 }],
        }),
      },
    );

    expect(err).toBeInstanceOf(FacebookRateLimitError);
    expect(err.category).toBe("rate_limit");
    if (err.category === "rate_limit") {
      expect(err.code).toBe(FacebookErrorCode.TOO_MANY_CALLS);
      // header JSON is camelized like every other response payload
      expect(err.usage?.appUsage).toEqual({ callCount: 95, totalCputime: 20, totalTime: 30 });
      expect(err.usage?.businessUseCaseUsage?.["1234"]?.[0]).toEqual({
        type: "pages",
        callCount: 99,
        estimatedTimeToRegainAccess: 7,
      });
    }
  });

  it("maps a Business-Use-Case page limit (80001) to rate-limit", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({ message: "too many page calls", type: "OAuthException", code: 80001 }),
    );
    expect(err).toBeInstanceOf(FacebookRateLimitError);
  });

  it("maps code 1 to a transient error", async () => {
    const err = await captureGetError(500, fbErrorBody({ message: "down", type: "API Unknown", code: 1 }));
    expect(err).toBeInstanceOf(FacebookTransientError);
    expect(err.isTransient).toBe(true);
  });

  it("treats is_transient:true as transient regardless of code", async () => {
    const err = await captureGetError(
      500,
      fbErrorBody({ message: "blip", type: "X", code: 999999, is_transient: true }),
    );
    expect(err).toBeInstanceOf(FacebookTransientError);
  });

  it("maps GraphMethodException / code 100 to invalid_param", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({ message: "Unsupported get request", type: "GraphMethodException", code: 100 }),
    );
    expect(err).toBeInstanceOf(FacebookInvalidParamError);
  });

  it("maps the policy block (368) to policy_block", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({ message: "temporarily blocked", type: "OAuthException", code: 368 }),
    );
    expect(err).toBeInstanceOf(FacebookPolicyBlockError);
  });

  it("falls back to FacebookUnknownError for an unrecognized envelope", async () => {
    const err = await captureGetError(
      400,
      fbErrorBody({ message: "mystery", type: "WeirdException", code: 7654321 }),
    );
    expect(err).toBeInstanceOf(FacebookUnknownError);
    expect(err.category).toBe("unknown");
  });
});

describe("onError hook — transport failures", () => {
  it("wraps a no-response failure as FacebookNetworkError", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    const cause = new Error("socket hang up");

    await expect(http.get("/x", { adapter: throwingAdapter(cause) })).rejects.toThrow("socket hang up");

    const [err] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(FacebookNetworkError);
    expect(err.category).toBe("network");
    expect(err.httpStatus).toBe(0);
    expect(err.isTransient).toBe(true);
    expect(err.raw).toBe(cause);
  });

  it("wraps a non-JSON error body (proxy HTML) as FacebookNetworkError", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const http = createHttpClient(TOKEN, { onError });
    await expect(
      http.get("/x", { adapter: adapterReturning(502, "<html>bad gateway</html>") }),
    ).rejects.toThrow();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(FacebookNetworkError);
  });
});

describe("onError hook — handler safety", () => {
  it("swallows a throwing handler without masking the underlying error", async () => {
    const http = createHttpClient(TOKEN, {
      onError: () => {
        throw new Error("handler blew up");
      },
    });
    await expect(
      http.get("/x", {
        adapter: adapterReturning(400, fbErrorBody({ message: "real", type: "T", code: 100 })),
      }),
    ).rejects.toMatchObject({ isAxiosError: true });
  });

  it("swallows a rejecting async handler (no unhandled rejection)", async () => {
    const http = createHttpClient(TOKEN, {
      // Users routinely pass async hooks; the SDK must defuse a rejected one.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- exercising exactly that path
      onError: () => Promise.reject(new Error("async boom")),
    });
    await expect(
      http.get("/x", {
        adapter: adapterReturning(400, fbErrorBody({ message: "real", type: "T", code: 100 })),
      }),
    ).rejects.toThrow();
  });

  it("leaves behaviour unchanged when no onError is configured", async () => {
    const http = createHttpClient(TOKEN);
    await expect(
      http.get("/x", { adapter: adapterReturning(400, fbErrorBody({ message: "x", type: "T", code: 1 })) }),
    ).rejects.toMatchObject({ isAxiosError: true });
  });
});

describe("onError hook — batch sub-responses", () => {
  function batchWith(
    onError: (e: FacebookError, ctx: FacebookErrorContext) => void,
    subResponses: (BatchSubResponse | null)[],
  ) {
    const http = createHttpClient(TOKEN);
    const httpWithAdapter: typeof http = {
      ...http,
      post: (path, data) => http.post(path, data, { adapter: adapterReturning(200, subResponses) }),
    };
    return createBatchResource(httpWithAdapter, { onError });
  }

  it("reports a failed sub-response and leaves the returned data untouched", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const subResponses = [
      { code: 200, body: JSON.stringify({ id: "ok" }) },
      { code: 400, body: JSON.stringify({ error: { message: "bad", type: "OAuthException", code: 190 } }) },
    ];
    const batch = batchWith(onError, subResponses);

    const results = await batch([
      { method: "GET", relative_url: "a" },
      { method: "GET", relative_url: "b" },
    ]);

    // Hook fired exactly once, with the parsed+classified error for the failed sub-request.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(FacebookAuthError);
    // Public batch contract is unchanged: error data is still the raw body string.
    expect(results).toEqual([
      { status: 200, data: { id: "ok" } },
      { status: 400, data: subResponses[1]!.body },
    ]);
  });

  it("reports a null (timed-out) sub-response as a network error", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const batch = batchWith(onError, [{ code: 200, body: "{}" }, null]);

    const results = await batch([
      { method: "GET", relative_url: "a" },
      { method: "GET", relative_url: "b" },
    ]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(FacebookNetworkError);
    expect(results[1]).toEqual({ status: 0, data: null });
  });

  it("does not fire when every sub-response succeeds", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const batch = batchWith(onError, [{ code: 200, body: "{}" }]);
    await batch([{ method: "GET", relative_url: "a" }]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("tags batch failures with source 'batch' and the sub-request url", async () => {
    const onError = vi.fn<(e: FacebookError, ctx: FacebookErrorContext) => void>();
    const subResponses = [
      { code: 400, body: JSON.stringify({ error: { message: "bad", type: "OAuthException", code: 190 } }) },
    ];
    const batch = batchWith(onError, subResponses);
    await batch([{ method: "GET", relative_url: "123/comments" }]);
    expect(onError.mock.calls[0]![1]).toEqual({
      method: "GET",
      relativeUrl: "123/comments",
      accessToken: TOKEN,
      source: "batch",
    });
  });
});
