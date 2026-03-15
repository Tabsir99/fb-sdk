import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../../src/store/memory.js";

describe("memoryStore", () => {
  let store: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    store = createMemoryStore();
  });

  describe("recordActivity", () => {
    it("stores a new post activity", async () => {
      await store.recordActivity("page1", "post1", 1000);
      const posts = await store.getActivePosts("page1", 0);
      expect(posts).toContain("post1");
    });

    it("updates timestamp if newer time is provided", async () => {
      await store.recordActivity("page1", "post1", 1000);
      await store.recordActivity("page1", "post1", 2000);

      // getActivePosts with since=1500 should return post1 (stored as 2000)
      const posts = await store.getActivePosts("page1", 1500);
      expect(posts).toContain("post1");
    });

    it("does NOT update if older time is provided", async () => {
      await store.recordActivity("page1", "post1", 2000);
      await store.recordActivity("page1", "post1", 1000);

      // stored should still be 2000, not 1000
      const posts = await store.getActivePosts("page1", 1500);
      expect(posts).toContain("post1");

      const postsEarlier = await store.getActivePosts("page1", 2001);
      expect(postsEarlier).not.toContain("post1");
    });

    it("isolates multiple pages from each other", async () => {
      await store.recordActivity("page1", "post1", 1000);
      await store.recordActivity("page2", "post2", 1000);

      const page1Posts = await store.getActivePosts("page1", 0);
      expect(page1Posts).not.toContain("post2");
    });
  });

  describe("getActivePosts", () => {
    it("returns empty array when page has no activity", async () => {
      const posts = await store.getActivePosts("nonexistent", 0);
      expect(posts).toEqual([]);
    });

    it("returns only posts at or after since timestamp", async () => {
      await store.recordActivity("page1", "post1", 1000);
      await store.recordActivity("page1", "post2", 2000);
      await store.recordActivity("page1", "post3", 3000);

      const posts = await store.getActivePosts("page1", 2000);
      expect(posts).toContain("post2");
      expect(posts).toContain("post3");
      expect(posts).not.toContain("post1");
    });

    it("returns empty array when all posts are before since", async () => {
      await store.recordActivity("page1", "post1", 1000);
      const posts = await store.getActivePosts("page1", 5000);
      expect(posts).toEqual([]);
    });
  });

  describe("cleanup", () => {
    it("removes posts older than olderThan", async () => {
      await store.recordActivity("page1", "post1", 1000);
      await store.recordActivity("page1", "post2", 3000);

      await store.cleanup(2000);

      const posts = await store.getActivePosts("page1", 0);
      expect(posts).not.toContain("post1");
      expect(posts).toContain("post2");
    });

    it("removes the page entry when all its posts are cleaned up", async () => {
      await store.recordActivity("page1", "post1", 1000);
      await store.cleanup(5000);

      const posts = await store.getActivePosts("page1", 0);
      expect(posts).toEqual([]);
    });

    it("does not affect posts newer than olderThan", async () => {
      await store.recordActivity("page1", "post1", 5000);
      await store.cleanup(1000);

      const posts = await store.getActivePosts("page1", 0);
      expect(posts).toContain("post1");
    });
  });
});
