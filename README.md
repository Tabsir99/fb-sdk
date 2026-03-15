# @tabsircg/fb-sdk

A strongly-typed, modern TypeScript SDK for the Facebook Graph API (v25.0). It provides a fluent, resource-based interface with automatic `camelCase` ↔ `snake_case` transformation, seamless request batching, and an advanced type-safe field selector system that mimics GraphQL.

## Tech Stack
- **TypeScript** (v5.9.3) - Core language and advanced type system
- **Axios** (v1.13.6) - HTTP client for interacting with the Graph API
- **form-data** (v4.0.5) - For handling multipart/form-data (used in batching and media uploads)
- **dotenv** (v17.3.1) - Environment variable management
- **tsx** (v4.21.0) - For rapid development and execution of TypeScript files

## Environment Variables

No required environment variables are hardcoded into the SDK itself. However, to interact with the Facebook Graph API, you must supply a valid Access Token when initializing the client wrapper. 

For development (`npm run dev`), you likely need to configure your `.env` file with a token to test against `src/temp/test.ts` (though `dotenv` usage is up to the consumer).

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run build` | Compiles the TypeScript source code to JavaScript ES2022 format inside the `dist/` directory. |
| `npm run dev` | Runs the scratchpad/test file located at `src/temp/test.ts` using `tsx`. Useful for local testing. |
| `npm run prepublishOnly` | Automatically runs `npm run build` prior to publishing the package to npm. |

## Quick Start

```typescript
import { createFbSdk } from '@tabsircg/fb-sdk';

// 1. Initialize the SDK factory (optionally pass configuration like a Store)
const sdkFactory = createFbSdk();

// 2. Instantiate the client with a Page or User Access Token
const sdk = sdkFactory("EAAGYourAccessTokenHere...");

async function run() {
  // Fetch a page's recent posts, selecting specific fields
  const posts = await sdk.page("PAGE_ID").posts.list({
    fields: {
      id: true,
      message: true,
      createdTime: true
    },
    options: {
      limit: 5
    }
  });

  console.log("Recent posts:", posts.data);

  // Example: Publish a new image
  const publishTarget = await sdk.page("PAGE_ID").images.publish({
    url: "https://example.com/image.png",
    message: "Hello world!"
  });
  
  console.log("Published Post ID:", publishTarget.postId);
}

run().catch(console.error);
```

## Common Errors & Fixes

**FacebookUploadError**
- *Symptom:* The SDK throws an error during a video or reel upload, typically containing a `FacebookMedia["status"]` payload.
- *Fix:* This is an asynchronous processing error on Facebook's side. The SDK polls the status of uploads. Inspect the error message (extracted via `getProcessingError` in `poller.ts`) which might indicate unsupported codecs, file size limits exceeded, or temporary Facebook outages.

**Batching Issues ("API Error code 2/3")**
- *Symptom:* `sdk.batch([ ...requests ])` fails with a confusing Graph API error.
- *Fix:* Ensure all requests inside the batch call were invoked without `await`. A `BatchableRequest` triggers a standard HTTP call if awaited, but returns `{ method, relative_url }` otherwise which the `batch` method leverages.

**Type errors on `fields` selector**
- *Symptom:* TypeScript complains when selecting nested fields like `comments: { ... }`.
- *Fix:* Verify that the nested property is defined as an object or `CollectionOf<T>` in the type definitions (`src/types/`). Ensure you use the exact camelCase keys for fields (e.g., `createdTime` instead of `created_time`).
