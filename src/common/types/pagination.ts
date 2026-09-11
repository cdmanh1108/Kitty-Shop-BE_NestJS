export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function paginateMeta(
  page: number,
  limit: number,
  total: number,
): PaginatedResult<never>['meta'] {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
