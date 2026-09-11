export function isOverlapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('rental_item_no_overlap') ||
    message.toLowerCase().includes('exclusion constraint')
  );
}
