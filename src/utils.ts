// import { toSnakeCase } from "./lib/transformCase.js";

// export function toGraphFields(fields: Record<string, any>): string {
//   return Object.entries(fields)
//     .map(([key, value]) => {
//       const snakeKey = toSnakeCase(key);
//       return value === true ? snakeKey : `${snakeKey}{${toGraphFields(value)}}`;
//     })
//     .join(",");
// }

import { toSnakeCase } from "./lib/transformCase.js";

function serializeEdgeOptions(options?: Record<string, unknown>): string {
  if (!options) return "";
  return Object.entries(options)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `.${toSnakeCase(k)}(${v})`)
    .join("");
}

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

      // Plain nested field selector
      return `${snakeKey}{${toGraphFields(value)}}`;
    })
    .join(",");
}
