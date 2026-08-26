export type JsonPrimitive = boolean | number | string | null;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface JsonArray extends ReadonlyArray<JsonValue> {}

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
