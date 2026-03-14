import { FacebookMedia } from "../types/facebookmedia.js";

export class FacebookUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: FacebookMedia["status"],
  ) {
    super(message);
    this.name = "FacebookUploadError";
  }
}

// // Retry configuration
// const MAX_RETRIES = 3;
// const INITIAL_RETRY_DELAY = 1000; // 1 second

// // Facebook specific retryable error codes
// const RETRYABLE_FB_ERROR_CODES = [
//   1, // Unknown error
//   2, // Service temporary unavailable
//   4, // App level rate limit reached
//   17, // User level rate limit reached
//   341, // Application request limit reached
// ];

// const REVOKED_ERROR_CODES = [
//   190, // Access token expired | User changed password | User revoked app permissions | Token revoked by facebook
// ];

// interface RetryConfig extends InternalAxiosRequestConfig {
//   __retryCount?: number;
// }

// // Facebook error response type
// interface FBErrorResponse {
//   error?: {
//     code: number;
//     message: string;
//     type: string;
//   };
// }

// const _getAccessToken = (config: RetryConfig): string | null => {
//   if (typeof config.params?.access_token === "string") return config.params.access_token;

//   if (config.data instanceof URLSearchParams) return config.data.get("access_token");

//   if (config.data instanceof FormData) return config.data.get("access_token")?.toString() || null;

//   const accessToken = new URLSearchParams(config.url?.split("?")[1]).get("access_token");

//   return accessToken;
// };

// fbApi.interceptors.response.use(
//   (response) => response,
//   async (error: AxiosError<FBErrorResponse>) => {
//     const response = error.response;
//     const config = error.config as RetryConfig;

//     // If config does not exist or retry is disabled, reject
//     if (!config) return Promise.reject(error);

//     if (REVOKED_ERROR_CODES.includes(response?.data?.error?.code ?? 0)) {
//       const accessToken = _getAccessToken(config);
//       console.log("\n\n", accessToken, "\n\n");

//       if (accessToken) await markChannelAsRevokedAndSendEmail(accessToken);

//       return Promise.reject(error);
//     }

//     // Initialize retry count
//     config.__retryCount = config.__retryCount || 0;

//     // Check if we should retry
//     const isNetworkError = !response;
//     const isServerError = response && response.status >= 500 && response.status <= 599;

//     let isRetryableFbError = false;
//     if (response && response.data && response.data.error) {
//       const fbErrorCode = response.data.error.code;
//       if (RETRYABLE_FB_ERROR_CODES.includes(fbErrorCode)) {
//         isRetryableFbError = true;
//       }
//     }

//     const shouldRetry =
//       config.__retryCount < MAX_RETRIES && (isNetworkError || isServerError || isRetryableFbError);

//     if (shouldRetry) {
//       config.__retryCount += 1;

//       // Exponential backoff delay: 1s, 2s, 4s...
//       const delay = INITIAL_RETRY_DELAY * Math.pow(2, config.__retryCount - 1);

//       console.log(
//         `[fbApi] Retrying request (${config.__retryCount}/${MAX_RETRIES}) in ${delay}ms... URL: ${config.url}`,
//       );

//       // Create a promise that waits for the delay
//       const backoff = new Promise((resolve) => {
//         setTimeout(() => {
//           resolve(null);
//         }, delay);
//       });

//       await backoff;

//       // Return the original axios instance with the updated config
//       return fbApi(config);
//     }

//     return Promise.reject(error);
//   },
// );
