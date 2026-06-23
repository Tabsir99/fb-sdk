import type { Store } from "./types.js";

/**
 * Minimal Redis client interface — matches ioredis and most Redis clients.
 * The user passes their own client instance; we don't import ioredis.
 * `zadd` is variadic so flags like GT can be passed (ioredis-compatible).
 */
export interface RedisLike {
  zadd(key: string, ...args: (string | number)[]): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

const PREFIX = "fb:comments:";

/**
 * Creates a Redis-backed Store using sorted sets.
 * Key per page: `fb:comments:{pageId}`, members are post IDs, scores are timestamps.
 * Suitable for multi-process / multi-server deployments.
 *
 * Requires Redis ≥ 6.2 (uses `ZADD GT` so out-of-order webhook deliveries can
 * never move a post's last-activity timestamp backwards — same semantics as
 * the memory store).
 */
export function createRedisStore(client: RedisLike): Store {
  return {
    async recordActivity(pageId, postId, time) {
      await client.zadd(`${PREFIX}${pageId}`, "GT", time, postId);
    },

    async getActivePosts(pageId, since) {
      return client.zrangebyscore(`${PREFIX}${pageId}`, since, "+inf");
    },

    async cleanup(olderThan) {
      const keys = await client.keys(`${PREFIX}*`);
      await Promise.all(keys.map((key) => client.zremrangebyscore(key, "-inf", olderThan)));
    },
  };
}
