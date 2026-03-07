import { toSnakeCase } from "./lib/transformCase.js";

export function toGraphFields(fields: Record<string, any>): string {
  return Object.entries(fields)
    .map(([key, value]) => {
      const snakeKey = toSnakeCase(key);
      return value === true ? snakeKey : `${snakeKey}{${toGraphFields(value)}}`;
    })
    .join(",");
}
