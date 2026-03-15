import { expectTypeOf } from "expect-type";
import type { SnakeToCamel, KeysToCamel, CamelToSnake, KeysToSnake } from "../../src/lib/transformCase.js";

// 1. SnakeToCamel converts "created_time" to "createdTime"
expectTypeOf<SnakeToCamel<"created_time">>().toEqualTypeOf<"createdTime">();

// 2. SnakeToCamel converts "some_nested_key" to "someNestedKey"
expectTypeOf<SnakeToCamel<"some_nested_key">>().toEqualTypeOf<"someNestedKey">();

// 3. SnakeToCamel on a string with no underscores is unchanged
expectTypeOf<SnakeToCamel<"message">>().toEqualTypeOf<"message">();

// 4. KeysToCamel on a flat object converts all keys
expectTypeOf<KeysToCamel<{ created_time: string; post_id: string }>>().toEqualTypeOf<{
  createdTime: string;
  postId: string;
}>();

// 5. KeysToCamel on a nested object converts keys at all depths
expectTypeOf<
  KeysToCamel<{ outer_key: { inner_key: boolean } }>
>().toEqualTypeOf<{ outerKey: { innerKey: boolean } }>();

// 6. KeysToCamel on an array of objects converts all keys in each element
expectTypeOf<
  KeysToCamel<{ some_key: number }[]>
>().toEqualTypeOf<{ someKey: number }[]>();

// 7. KeysToCamel preserves keys starting with underscore (_)
expectTypeOf<
  KeysToCamel<{ _internal: string; some_key: string }>
>().toEqualTypeOf<{ _internal: string; someKey: string }>();

// 8. CamelToSnake converts "createdTime" to "created_time"
expectTypeOf<CamelToSnake<"createdTime">>().toEqualTypeOf<"created_time">();

// 9. KeysToSnake converts camelCase object keys to snake_case
expectTypeOf<
  KeysToSnake<{ createdTime: string; autoId: number }>
>().toEqualTypeOf<{ created_time: string; auto_id: number }>();
