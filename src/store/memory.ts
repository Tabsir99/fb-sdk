import type { CommentStore } from "./types.js";

/**
 * Creates an in-memory CommentStore.
 * Suitable for single-process apps. Data is lost on restart.
 */
export function createMemoryStore(): CommentStore {
  // pageId → postId → lastActivityTimestamp
  const pages = new Map<string, Map<string, number>>();

  return {
    async recordActivity(pageId, postId, time) {
      let posts = pages.get(pageId);
      if (!posts) {
        posts = new Map();
        pages.set(pageId, posts);
      }
      const existing = posts.get(postId);
      if (existing === undefined || time > existing) {
        posts.set(postId, time);
      }
    },

    async getActivePosts(pageId, since) {
      const posts = pages.get(pageId);
      if (!posts) return [];

      const result: string[] = [];
      for (const [postId, time] of posts) {
        if (time >= since) result.push(postId);
      }
      return result;
    },

    async cleanup(olderThan) {
      for (const [pageId, posts] of pages) {
        for (const [postId, time] of posts) {
          if (time < olderThan) posts.delete(postId);
        }
        if (posts.size === 0) pages.delete(pageId);
      }
    },
  };
}
