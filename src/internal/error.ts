import { type FacebookMedia } from "../types/facebookmedia.js";

export class FacebookUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: FacebookMedia["status"],
  ) {
    super(message);
    this.name = "FacebookUploadError";
  }
}

// Retry/backoff is intentionally NOT implemented here — the current direction is
// to leave retries to the caller (see README → Contributing). If that changes,
// implement it as an opt-in axios interceptor with exponential backoff + jitter,
// keyed on FB's retryable error codes (1, 2, 4, 17, 341) and 5xx/network errors.
