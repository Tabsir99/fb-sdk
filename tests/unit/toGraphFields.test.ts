import { describe, it, expect } from "vitest";
import { toGraphFields } from "../../src/internal/utils.js";

describe("toGraphFields", () => {
  it("serializes basic fields", () => {
    expect(toGraphFields({ id: true, message: true })).toBe("id,message");
  });

  it("snake_cases camelCase keys", () => {
    expect(toGraphFields({ createdTime: true })).toBe("created_time");
  });

  it("filters out false values", () => {
    expect(toGraphFields({ id: true, message: false })).toBe("id");
  });

  it("filters out undefined values", () => {
    expect(toGraphFields({ id: true, message: undefined })).toBe("id");
  });

  it("returns empty string for empty object", () => {
    expect(toGraphFields({})).toBe("");
  });

  it("serializes nested collection with fields only", () => {
    expect(
      toGraphFields({ comments: { fields: { id: true, message: true } } })
    ).toBe("comments{id,message}");
  });

  it("serializes nested collection with options", () => {
    expect(
      toGraphFields({ comments: { fields: { id: true }, options: { limit: 5 } } })
    ).toBe("comments.limit(5){id}");
  });

  it("serializes nested collection with multiple options, snake_casing option keys", () => {
    expect(
      toGraphFields({
        comments: {
          fields: { id: true },
          options: { limit: 5, order: "chronological" },
        },
      })
    ).toBe("comments.limit(5).order(chronological){id}");
  });

  it("serializes plain nested object (no fields key)", () => {
    expect(toGraphFields({ reactions: { summary: true } })).toBe(
      "reactions{summary}"
    );
  });

  it("serializes multiple top-level fields in object.entries order", () => {
    expect(
      toGraphFields({ id: true, message: true, createdTime: true })
    ).toBe("id,message,created_time");
  });
});
