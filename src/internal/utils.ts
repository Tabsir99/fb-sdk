import { toSnakeCase } from "../lib/transformCase.js";

function serializeEdgeOptions(options?: Record<string, unknown>): string {
  if (!options) return "";
  return Object.entries(options)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `.${toSnakeCase(k)}(${v})`)
    .join("");
}

/** Serialize a nested field-selector object into a Graph API `fields` string, encoding edge options as `.opt(value)`. */
export function toGraphFields(fields: Record<string, any>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => {
      const snakeKey = toSnakeCase(key);
      if (value === true) return snakeKey;

      // { options?, fields } shape — nested collection with edge options
      if (value.fields) {
        const opts = serializeEdgeOptions(value.options);
        return `${snakeKey}${opts}{${toGraphFields(value.fields)}}`;
      }

      return `${snakeKey}{${toGraphFields(value)}}`;
    })
    .join(",");
}
