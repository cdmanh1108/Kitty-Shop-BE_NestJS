-- Storefront catalog query performance indexes
-- Supports category filtering by slug
CREATE INDEX IF NOT EXISTS idx_categories_shop_slug ON categories (shop_id, slug);

-- Supports hot-path storefront product listing (shop tenancy, active, public, rentable, unarchived, sorted by createdAt DESC)
CREATE INDEX IF NOT EXISTS idx_products_storefront_active ON products (shop_id, status, is_public, is_rentable, archived_at, created_at DESC);

-- Supports primary thumbnail resolution (isPrimary DESC, sortOrder ASC)
CREATE INDEX IF NOT EXISTS idx_product_media_primary_sort ON product_media (product_id, is_primary DESC, sort_order ASC);
