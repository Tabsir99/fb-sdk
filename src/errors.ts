/**
 * Public error surface — `@tabsircg/fb-sdk/errors`.
 *
 * Kept off the main entry so the root import stays focused on the SDK factory
 * and resources. Only code that inspects or handles failures needs these: the
 * typed {@link FacebookError} union passed to `createFbSdk({ onError })`, the
 * concrete classes (for `instanceof`), and the documented code/subcode constants.
 */

export {
  FacebookUploadError,
  FacebookErrorBase,
  FacebookGraphError,
  FacebookAuthError,
  FacebookPermissionError,
  FacebookPolicyBlockError,
  FacebookRateLimitError,
  FacebookInvalidParamError,
  FacebookTransientError,
  FacebookUnknownError,
  FacebookNetworkError,
  FacebookErrorCode,
  FacebookAuthSubcode,
} from "./internal/error.js";

export type {
  FacebookError,
  FacebookErrorHook,
  FacebookGraphErrorUnion,
} from "./internal/error.js";

export type {
  FacebookErrorCategory,
  RawFacebookError,
  RateLimitUsage,
  AppUsage,
  BusinessUseCaseUsage,
} from "./types/facebookerror.js";
