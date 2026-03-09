import FormData from "form-data";

export type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<SnakeToCamel<T>>}`
  : S;

export type KeysToCamel<T> = T extends (infer U)[]
  ? KeysToCamel<U>[]
  : T extends object
    ? { [K in keyof T as K extends `_${string}` ? K : SnakeToCamel<string & K>]: KeysToCamel<T[K]> }
    : T;

export function toCamel<T>(obj: T): KeysToCamel<T> {
  if (typeof obj === "string") return toCamelCase(obj) as any;
  if (Array.isArray(obj)) return obj.map(toCamel) as KeysToCamel<T>;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamelCase(k), toCamel(v)]),
    ) as KeysToCamel<T>;
  }
  return obj as KeysToCamel<T>;
}

export type CamelToSnake<S extends string> = S extends `${infer H}${infer T}`
  ? T extends Uncapitalize<T>
    ? `${Uncapitalize<H>}${CamelToSnake<T>}`
    : `${Uncapitalize<H>}_${CamelToSnake<T>}`
  : S;

export type KeysToSnake<T> = T extends (infer U)[]
  ? KeysToSnake<U>[]
  : T extends object
    ? { [K in keyof T as CamelToSnake<string & K>]: KeysToSnake<T[K]> }
    : T;

export function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function toSnakeObj<T>(obj: T): KeysToSnake<T> {
  if (typeof obj === "string") return toSnakeCase(obj) as KeysToSnake<T>;
  if (Array.isArray(obj)) return obj.map(toSnakeObj) as KeysToSnake<T>;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toSnakeCase(k), toSnakeObj(v)]),
    ) as KeysToSnake<T>;
  }
  return obj as KeysToSnake<T>;
}

export function toSnakeFormData(data: Record<string, any>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value == null || value === "") continue;

    form.append(
      toSnakeCase(key),
      typeof value === "object" && !(value instanceof Buffer) && !value.pipe
        ? JSON.stringify(toSnakeObj(value))
        : value,
    );
  }
  return form;
}
