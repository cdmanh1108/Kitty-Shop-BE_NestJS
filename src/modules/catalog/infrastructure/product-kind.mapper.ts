import { isProductKind, type ProductKind } from '../domain/product-kind';

/** Narrow the checked database string without silently reclassifying stored data. */
export function readProductKind(value: string): ProductKind {
  if (!isProductKind(value)) {
    throw new Error('Loại sản phẩm lưu trữ không hợp lệ.');
  }
  return value;
}
