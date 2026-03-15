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

    it("passes primitives through unchanged", () => {
      expect(toCamel(42)).toBe(42);
      // toCamel on a string runs toCamelCase on it
      expect(toCamel("created_time")).toBe("createdTime");
      expect(toCamel("hello")).toBe("hello");
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
  });
});
