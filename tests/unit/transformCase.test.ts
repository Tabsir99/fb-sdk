import { describe, it, expect } from "vitest";
import {
  toCamel,
  toSnakeObj,
  toSnakeCase,
  toCamelCase,
} from "../../src/lib/transformCase.js";

describe("transformCase", () => {
  describe("toCamelCase", () => {
    it("converts snake_case to camelCase", () => {
      expect(toCamelCase("created_time")).toBe("createdTime");
      expect(toCamelCase("post_id")).toBe("postId");
      expect(toCamelCase("some_nested_key")).toBe("someNestedKey");
    });

    it("leaves string with no underscore unchanged", () => {
      expect(toCamelCase("message")).toBe("message");
    });

    it("leaves already camelCase string unchanged", () => {
      expect(toCamelCase("alreadyCamel")).toBe("alreadyCamel");
    });
  });

  describe("toSnakeCase", () => {
    it("converts camelCase to snake_case", () => {
      expect(toSnakeCase("createdTime")).toBe("created_time");
      expect(toSnakeCase("postId")).toBe("post_id");
      expect(toSnakeCase("someNestedKey")).toBe("some_nested_key");
    });

    it("leaves string with no capitals unchanged", () => {
      expect(toSnakeCase("message")).toBe("message");
    });
  });

  describe("toCamel", () => {
    it("converts keys of a flat object to camelCase", () => {
      expect(toCamel({ created_time: "2024", post_id: "123" })).toEqual({
        createdTime: "2024",
        postId: "123",
      });
    });

    it("converts keys of a nested object to camelCase", () => {
      expect(toCamel({ outer_key: { inner_key: 1 } })).toEqual({
        outerKey: { innerKey: 1 },
      });
    });

    it("converts keys of objects in an array to camelCase", () => {
      expect(toCamel([{ some_key: 1 }, { some_key: 2 }])).toEqual([
        { someKey: 1 },
        { someKey: 2 },
      ]);
    });

    it("passes primitives through unchanged — including bare strings", () => {
      expect(toCamel(42)).toBe(42);
      // toCamel transforms KEYS only; a bare string is a value, not a key
      expect(toCamel("created_time")).toBe("created_time");
      expect(toCamel("hello")).toBe("hello");
    });

    it("never rewrites string VALUES (message text, cursors, URLs)", () => {
      expect(toCamel({ message: "check_this out, see my_page" })).toEqual({
        message: "check_this out, see my_page",
      });
      // base64url pagination cursors legitimately contain underscores
      expect(toCamel({ paging: { cursors: { after: "QVFIU_n3aBc_x9" } } })).toEqual({
        paging: { cursors: { after: "QVFIU_n3aBc_x9" } },
      });
      expect(toCamel({ permalink_url: "https://fb.com/posts/pfbid0_abc" })).toEqual({
        permalinkUrl: "https://fb.com/posts/pfbid0_abc",
      });
    });

    it("passes null through unchanged", () => {
      expect(toCamel(null)).toBe(null);
    });

    it("transforms keys starting with _ by consuming the _ and capitalizing the next letter at runtime", () => {
      // The _ prefix is consumed by the regex /_([a-z])/g, so _i in _internal becomes I
      expect(toCamel({ _internal: 1, some_key: 2 })).toEqual({
        Internal: 1,
        someKey: 2,
      });
    });
  });

  describe("toSnakeObj", () => {
    it("converts keys of a flat object to snake_case", () => {
      expect(toSnakeObj({ createdTime: "2024" })).toEqual({
        created_time: "2024",
      });
    });

    it("converts keys of a nested object to snake_case", () => {
      expect(toSnakeObj({ outerKey: { innerKey: 1 } })).toEqual({
        outer_key: { inner_key: 1 },
      });
    });

    it("converts keys of objects in an array to snake_case", () => {
      expect(toSnakeObj([{ someKey: 1 }])).toEqual([{ some_key: 1 }]);
    });

    it("never rewrites string VALUES (post bodies must arrive verbatim)", () => {
      expect(toSnakeObj({ message: "Hello World" })).toEqual({ message: "Hello World" });
      expect(toSnakeObj({ geoLocations: { countries: ["US", "GB"] } })).toEqual({
        geo_locations: { countries: ["US", "GB"] },
      });
      expect(toSnakeObj("alreadyCamel")).toBe("alreadyCamel");
    });
  });

  describe("toSnakeFormData", () => {
    it("stringifies booleans — form-data rejects raw boolean values", async () => {
      const { toSnakeFormData } = await import("../../src/lib/transformCase.js");
      const form = toSnakeFormData({ published: true, fileUrl: "https://x/v.mp4" });
      const content = form.getBuffer().toString();
      expect(content).toContain('name="published"');
      expect(content).toContain("true");
      expect(content).toContain('name="file_url"');
    });

    it("JSON-encodes nested objects with snake_cased keys and verbatim values", async () => {
      const { toSnakeFormData } = await import("../../src/lib/transformCase.js");
      const form = toSnakeFormData({
        feedTargeting: { geoLocations: { countries: ["US"] } },
      });
      const content = form.getBuffer().toString();
      expect(content).toContain('name="feed_targeting"');
      expect(content).toContain('{"geo_locations":{"countries":["US"]}}');
    });
  });
});
