/** Existing decimal read values remain lossless and serialize as strings. No arithmetic API is exposed. */
export interface DecimalValue {
  toString(): string;
  toJSON(): string;
}
