/** JSON columns/settings deliberately accept arbitrary JSON, not arbitrary JavaScript objects. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

/** Shape of an internally persisted JSON response (Date/decimal values serialize as strings). */
export type JsonSerialized<T> = T extends { toJSON(): infer R }
  ? R
  : T extends Array<infer Item>
    ? JsonSerialized<Item>[]
    : T extends object
      ? { [Key in keyof T]: JsonSerialized<T[Key]> }
      : T;
