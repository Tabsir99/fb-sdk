import FormData from "form-data";

/** Type-level snake_case → camelCase for a string literal. */
export type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<SnakeToCamel<T>>}`
  : S;

/** Recursively camelCase object keys at the type level (values unchanged). */
export type KeysToCamel<T> = T extends (infer U)[]
  ? KeysToCamel<U>[]
  : T extends object
    ? { [K in keyof T as K extends `_${string}` ? K : SnakeToCamel<string & K>]: KeysToCamel<T[K]> }
    : T;

/** Recursively camelCase object keys; string values (message text, cursors, URLs) pass through untouched. */
export function toCamel<T>(obj: T): KeysToCamel<T> {
  if (Array.isArray(obj)) return obj.map(toCamel) as KeysToCamel<T>;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamelCase(k), toCamel(v)]),
    ) as KeysToCamel<T>;
  }
  return obj as KeysToCamel<T>;
}

/** Type-level camelCase → snake_case for a string literal. */
export type CamelToSnake<S extends string> = S extends `${infer H}${infer T}`
  ? T extends Uncapitalize<T>
    ? `${Uncapitalize<H>}${CamelToSnake<T>}`
    : `${Uncapitalize<H>}_${CamelToSnake<T>}`
  : S;

/** Recursively snake_case object keys at the type level (values unchanged). */
export type KeysToSnake<T> = T extends (infer U)[]
  ? KeysToSnake<U>[]
  : T extends object
    ? { [K in keyof T as CamelToSnake<string & K>]: KeysToSnake<T[K]> }
    : T;

/** camelCase → snake_case for a single string. */
export function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}
/** snake_case → camelCase for a single string. */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Recursively snake_case object keys; string values pass through untouched. */
export function toSnakeObj<T>(obj: T): KeysToSnake<T> {
  if (Array.isArray(obj)) return obj.map(toSnakeObj) as KeysToSnake<T>;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toSnakeCase(k), toSnakeObj(v)]),
    ) as KeysToSnake<T>;
  }
  return obj as KeysToSnake<T>;
}

/**
 * Build a snake_cased {@link FormData} from an object, skipping null/empty values.
 * @remarks form-data accepts only strings/Buffers/streams — objects are JSON-encoded (Graph convention) and booleans stringified.
 */
export function toSnakeFormData(data: Record<string, any>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value == null || value === "") continue;

    const serialized =
      typeof value === "object" && !(value instanceof Buffer) && !value.pipe
        ? JSON.stringify(toSnakeObj(value))
        : typeof value === "boolean"
          ? String(value)
          : value;

    form.append(toSnakeCase(key), serialized);
  }
  return form;
}
