-- Initial production schema for Rental Shop.
-- Half-open rental intervals [reserved_from, reserved_until) are enforced at DB level.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "shops" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(50) NOT NULL UNIQUE,
  "name" VARCHAR(255) NOT NULL,
  "legal_name" VARCHAR(255),
  "phone" VARCHAR(30),
  "email" VARCHAR(255),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "logo_url" TEXT,
  "primary_color" VARCHAR(20),
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "shop_locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(30),
  "address_line" TEXT,
  "ward" VARCHAR(100),
  "district" VARCHAR(100),
  "city" VARCHAR(100),
  "province" VARCHAR(100),
  "country" CHAR(2) NOT NULL DEFAULT 'VN',
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_locations_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) UNIQUE,
  "phone" VARCHAR(30),
  "password_hash" TEXT,
  "full_name" VARCHAR(255) NOT NULL,
  "avatar_url" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "last_login_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "shop_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "employee_code" VARCHAR(50),
  "display_name" VARCHAR(255) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_members_shop_id_user_id_key" UNIQUE ("shop_id", "user_id"),
  CONSTRAINT "shop_members_shop_id_employee_code_key" UNIQUE ("shop_id", "employee_code")
);

CREATE TABLE "roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID REFERENCES "shops"("id") ON DELETE CASCADE,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "permissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(100) NOT NULL UNIQUE,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "member_roles" (
  "member_id" UUID NOT NULL REFERENCES "shop_members"("id") ON DELETE CASCADE,
  "role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("member_id", "role_id")
);

CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission_id" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE "refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "member_id" UUID NOT NULL REFERENCES "shop_members"("id") ON DELETE CASCADE,
  "token_hash" VARCHAR(128) NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "user_agent" TEXT,
  "ip_address" INET,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "customers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "customer_code" VARCHAR(50) NOT NULL,
  "full_name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(30) NOT NULL,
  "normalized_phone" VARCHAR(30) NOT NULL,
  "email" VARCHAR(255),
  "facebook" TEXT,
  "zalo" TEXT,
  "birthday" DATE,
  "gender" VARCHAR(30),
  "customer_type" VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "source" VARCHAR(50),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "customers_shop_id_customer_code_key" UNIQUE ("shop_id", "customer_code")
);

CREATE TABLE "customer_addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "label" VARCHAR(100),
  "recipient_name" VARCHAR(255),
  "phone" VARCHAR(30),
  "address_line" TEXT NOT NULL,
  "ward" VARCHAR(100),
  "district" VARCHAR(100),
  "city" VARCHAR(100),
  "province" VARCHAR(100),
  "country" CHAR(2) NOT NULL DEFAULT 'VN',
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "customer_notes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "is_pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "color" VARCHAR(20),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_shop_id_name_key" UNIQUE ("shop_id", "name")
);

CREATE TABLE "customer_tags" (
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "tag_id" UUID NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("customer_id", "tag_id")
);

CREATE TABLE "categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "parent_id" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255),
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "sizes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sizes_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "colors" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "hex_color" VARCHAR(20),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "colors_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "products" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "category_id" UUID NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255),
  "description" TEXT,
  "default_deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("default_deposit_amount" >= 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "is_rentable" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "products_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "product_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "variant_code" VARCHAR(100) NOT NULL,
  "size_id" UUID REFERENCES "sizes"("id") ON DELETE SET NULL,
  "color_id" UUID REFERENCES "colors"("id") ON DELETE SET NULL,
  "deposit_amount_override" DECIMAL(18,2) CHECK ("deposit_amount_override" IS NULL OR "deposit_amount_override" >= 0),
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "product_variants_shop_id_variant_code_key" UNIQUE ("shop_id", "variant_code")
);

CREATE TABLE "product_media" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" UUID REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "media_type" VARCHAR(20) NOT NULL DEFAULT 'IMAGE',
  "storage_key" TEXT,
  "url" TEXT NOT NULL,
  "alt_text" VARCHAR(255),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "inventory_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "variant_id" UUID NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "location_id" UUID REFERENCES "shop_locations"("id") ON DELETE SET NULL,
  "sku" VARCHAR(100) NOT NULL,
  "barcode" VARCHAR(100),
  "current_status" VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  "condition" VARCHAR(30) NOT NULL DEFAULT 'GOOD',
  "purchase_price" DECIMAL(18,2) CHECK ("purchase_price" IS NULL OR "purchase_price" >= 0),
  "purchase_date" DATE,
  "acquired_from" VARCHAR(255),
  "total_rental_count" INTEGER NOT NULL DEFAULT 0 CHECK ("total_rental_count" >= 0),
  "last_rented_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "metadata" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "inventory_items_shop_id_sku_key" UNIQUE ("shop_id", "sku"),
  CONSTRAINT "inventory_items_shop_id_barcode_key" UNIQUE ("shop_id", "barcode")
);

CREATE TABLE "rental_rates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" UUID REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "duration_days" INTEGER NOT NULL CHECK ("duration_days" > 0),
  "price" DECIMAL(18,2) NOT NULL CHECK ("price" >= 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "valid_from" DATE,
  "valid_until" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("valid_until" IS NULL OR "valid_from" IS NULL OR "valid_until" >= "valid_from")
);

CREATE TABLE "rental_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_number" VARCHAR(50) NOT NULL,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "location_id" UUID REFERENCES "shop_locations"("id") ON DELETE SET NULL,
  "rental_start_at" TIMESTAMPTZ(6) NOT NULL,
  "rental_end_at" TIMESTAMPTZ(6) NOT NULL,
  "actual_started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "status" VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
  "payment_status" VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
  "deposit_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "rental_subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("rental_subtotal" >= 0),
  "charges_total" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("charges_total" >= 0),
  "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("discount_total" >= 0),
  "deposit_required" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("deposit_required" >= 0),
  "grand_total" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("grand_total" >= 0),
  "note" TEXT,
  "internal_note" TEXT,
  "metadata" JSONB,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rental_orders_shop_id_order_number_key" UNIQUE ("shop_id", "order_number"),
  CHECK ("rental_end_at" > "rental_start_at")
);

CREATE TABLE "rental_order_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_id" UUID NOT NULL REFERENCES "rental_orders"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "variant_id" UUID NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
  "rental_start_at" TIMESTAMPTZ(6) NOT NULL,
  "rental_end_at" TIMESTAMPTZ(6) NOT NULL,
  "product_name_snapshot" VARCHAR(255) NOT NULL,
  "variant_name_snapshot" VARCHAR(255) NOT NULL,
  "sku_snapshot" VARCHAR(100),
  "unit_rental_price" DECIMAL(18,2) NOT NULL CHECK ("unit_rental_price" >= 0),
  "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("deposit_amount" >= 0),
  "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("discount_amount" >= 0),
  "line_total" DECIMAL(18,2) NOT NULL CHECK ("line_total" >= 0),
  "pricing_snapshot" JSONB,
  "status" VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("rental_end_at" > "rental_start_at")
);

CREATE TABLE "rental_item_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_id" UUID NOT NULL REFERENCES "rental_orders"("id") ON DELETE CASCADE,
  "order_item_id" UUID NOT NULL REFERENCES "rental_order_items"("id") ON DELETE CASCADE,
  "inventory_item_id" UUID NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
  "reserved_from" TIMESTAMPTZ(6) NOT NULL,
  "reserved_until" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'HELD',
  "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ(6),
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("reserved_until" > "reserved_from")
);

ALTER TABLE "rental_item_allocations"
  ADD CONSTRAINT "rental_item_no_overlap"
  EXCLUDE USING gist (
    "inventory_item_id" WITH =,
    tstzrange("reserved_from", "reserved_until", '[)') WITH &&
  )
  WHERE ("status" IN ('HELD', 'CONFIRMED', 'ACTIVE'));

CREATE TABLE "rental_order_charges" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_id" UUID NOT NULL REFERENCES "rental_orders"("id") ON DELETE CASCADE,
  "order_item_id" UUID REFERENCES "rental_order_items"("id") ON DELETE SET NULL,
  "charge_type" VARCHAR(30) NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" >= 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
  "metadata" JSONB,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" TIMESTAMPTZ(6),
  "voided_by" UUID
);

CREATE TABLE "rental_order_status_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_id" UUID NOT NULL REFERENCES "rental_orders"("id") ON DELETE CASCADE,
  "from_status" VARCHAR(30),
  "to_status" VARCHAR(30) NOT NULL,
  "reason" VARCHAR(100),
  "note" TEXT,
  "changed_by" UUID,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "inventory_service_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "inventory_item_id" UUID NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
  "order_id" UUID REFERENCES "rental_orders"("id") ON DELETE SET NULL,
  "service_type" VARCHAR(30) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  "description" TEXT,
  "vendor_name" VARCHAR(255),
  "cost" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("cost" >= 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "inventory_status_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "inventory_item_id" UUID NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,
  "from_status" VARCHAR(30),
  "to_status" VARCHAR(30) NOT NULL,
  "reason" VARCHAR(100),
  "order_id" UUID REFERENCES "rental_orders"("id") ON DELETE SET NULL,
  "service_record_id" UUID REFERENCES "inventory_service_records"("id") ON DELETE SET NULL,
  "notes" TEXT,
  "changed_by" UUID,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "payment_transactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_id" UUID NOT NULL REFERENCES "rental_orders"("id") ON DELETE RESTRICT,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "transaction_number" VARCHAR(50) NOT NULL,
  "direction" VARCHAR(10) NOT NULL,
  "purpose" VARCHAR(30) NOT NULL,
  "payment_method" VARCHAR(30) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  "external_reference" VARCHAR(255),
  "bank_reference" VARCHAR(255),
  "note" TEXT,
  "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" TIMESTAMPTZ(6),
  "voided_by" UUID,
  CONSTRAINT "payment_transactions_shop_id_transaction_number_key" UNIQUE ("shop_id", "transaction_number")
);

CREATE TABLE "expense_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_shop_id_code_key" UNIQUE ("shop_id", "code")
);

CREATE TABLE "expenses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "expense_number" VARCHAR(50) NOT NULL,
  "category_id" UUID NOT NULL REFERENCES "expense_categories"("id") ON DELETE RESTRICT,
  "order_id" UUID REFERENCES "rental_orders"("id") ON DELETE SET NULL,
  "inventory_item_id" UUID REFERENCES "inventory_items"("id") ON DELETE SET NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "payment_method" VARCHAR(30),
  "vendor_name" VARCHAR(255),
  "expense_date" DATE NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "receipt_url" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PAID',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" TIMESTAMPTZ(6),
  CONSTRAINT "expenses_shop_id_expense_number_key" UNIQUE ("shop_id", "expense_number")
);

CREATE TABLE "delivery_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "order_id" UUID NOT NULL REFERENCES "rental_orders"("id") ON DELETE CASCADE,
  "direction" VARCHAR(20) NOT NULL,
  "method" VARCHAR(30) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "scheduled_at" TIMESTAMPTZ(6),
  "picked_up_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "recipient_name" VARCHAR(255),
  "recipient_phone" VARCHAR(30),
  "address_line" TEXT,
  "ward" VARCHAR(100),
  "district" VARCHAR(100),
  "city" VARCHAR(100),
  "province" VARCHAR(100),
  "shipper_name" VARCHAR(255),
  "shipper_phone" VARCHAR(30),
  "shipping_fee" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("shipping_fee" >= 0),
  "tracking_code" VARCHAR(255),
  "notes" TEXT,
  "metadata" JSONB,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "reminders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "order_id" UUID REFERENCES "rental_orders"("id") ON DELETE CASCADE,
  "customer_id" UUID REFERENCES "customers"("id") ON DELETE CASCADE,
  "dedupe_key" VARCHAR(255) NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "dismissed_at" TIMESTAMPTZ(6),
  "dismissed_by" UUID,
  CONSTRAINT "reminders_shop_id_dedupe_key_key" UNIQUE ("shop_id", "dedupe_key")
);

CREATE TABLE "notification_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "reminder_id" UUID REFERENCES "reminders"("id") ON DELETE SET NULL,
  "customer_id" UUID REFERENCES "customers"("id") ON DELETE SET NULL,
  "order_id" UUID REFERENCES "rental_orders"("id") ON DELETE SET NULL,
  "channel" VARCHAR(20) NOT NULL,
  "recipient" VARCHAR(255),
  "template_code" VARCHAR(100),
  "content" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(50),
  "provider_message_id" VARCHAR(255),
  "sent_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "app_settings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "key" VARCHAR(150) NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_settings_shop_id_key_key" UNIQUE ("shop_id", "key")
);

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "actor_user_id" UUID,
  "actor_member_id" UUID,
  "action" VARCHAR(50) NOT NULL,
  "entity_type" VARCHAR(100) NOT NULL,
  "entity_id" UUID,
  "old_values" JSONB,
  "new_values" JSONB,
  "ip_address" INET,
  "user_agent" TEXT,
  "request_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "outbox_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempt_count" INTEGER NOT NULL DEFAULT 0 CHECK ("attempt_count" >= 0),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6)
);

CREATE TABLE "idempotency_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE,
  "key" VARCHAR(255) NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "request_hash" VARCHAR(128),
  "response_code" INTEGER,
  "response_body" JSONB,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "idempotency_records_shop_id_scope_key_key" UNIQUE ("shop_id", "scope", "key")
);

-- Query indexes
CREATE INDEX "shop_locations_shop_id_is_active_idx" ON "shop_locations"("shop_id", "is_active");
CREATE INDEX "users_phone_idx" ON "users"("phone");
CREATE INDEX "shop_members_user_id_status_idx" ON "shop_members"("user_id", "status");
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");
CREATE INDEX "customers_shop_id_normalized_phone_idx" ON "customers"("shop_id", "normalized_phone");
CREATE INDEX "customers_shop_id_full_name_idx" ON "customers"("shop_id", "full_name");
CREATE INDEX "customers_shop_id_status_idx" ON "customers"("shop_id", "status");
CREATE INDEX "customers_full_name_trgm_idx" ON "customers" USING GIN ("full_name" gin_trgm_ops);
CREATE INDEX "customer_addresses_customer_id_is_default_idx" ON "customer_addresses"("customer_id", "is_default");
CREATE INDEX "customer_notes_customer_id_is_pinned_idx" ON "customer_notes"("customer_id", "is_pinned");
CREATE INDEX "categories_shop_id_is_active_sort_order_idx" ON "categories"("shop_id", "is_active", "sort_order");
CREATE INDEX "products_shop_id_category_id_status_idx" ON "products"("shop_id", "category_id", "status");
CREATE INDEX "products_shop_id_name_idx" ON "products"("shop_id", "name");
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");
CREATE INDEX "inventory_items_shop_id_current_status_idx" ON "inventory_items"("shop_id", "current_status");
CREATE INDEX "inventory_items_variant_id_is_active_idx" ON "inventory_items"("variant_id", "is_active");
CREATE INDEX "rental_rates_product_id_variant_id_duration_days_is_active_idx" ON "rental_rates"("product_id", "variant_id", "duration_days", "is_active");
CREATE INDEX "rental_orders_shop_id_rental_start_at_rental_end_at_idx" ON "rental_orders"("shop_id", "rental_start_at", "rental_end_at");
CREATE INDEX "rental_orders_shop_id_status_idx" ON "rental_orders"("shop_id", "status");
CREATE INDEX "rental_orders_customer_id_created_at_idx" ON "rental_orders"("customer_id", "created_at");
CREATE INDEX "rental_order_items_order_id_idx" ON "rental_order_items"("order_id");
CREATE INDEX "rental_order_items_variant_id_rental_start_at_rental_end_at_idx" ON "rental_order_items"("variant_id", "rental_start_at", "rental_end_at");
CREATE INDEX "rental_item_allocations_inventory_item_id_reserved_from_reserved_until_idx" ON "rental_item_allocations"("inventory_item_id", "reserved_from", "reserved_until");
CREATE INDEX "rental_item_allocations_order_id_status_idx" ON "rental_item_allocations"("order_id", "status");
CREATE INDEX "rental_order_charges_order_id_charge_type_idx" ON "rental_order_charges"("order_id", "charge_type");
CREATE INDEX "rental_order_status_history_order_id_changed_at_idx" ON "rental_order_status_history"("order_id", "changed_at");
CREATE INDEX "inventory_service_records_inventory_item_id_status_idx" ON "inventory_service_records"("inventory_item_id", "status");
CREATE INDEX "inventory_status_history_inventory_item_id_changed_at_idx" ON "inventory_status_history"("inventory_item_id", "changed_at");
CREATE INDEX "payment_transactions_order_id_paid_at_idx" ON "payment_transactions"("order_id", "paid_at");
CREATE INDEX "payment_transactions_shop_id_paid_at_status_idx" ON "payment_transactions"("shop_id", "paid_at", "status");
CREATE INDEX "expenses_shop_id_expense_date_status_idx" ON "expenses"("shop_id", "expense_date", "status");
CREATE INDEX "expenses_order_id_idx" ON "expenses"("order_id");
CREATE INDEX "delivery_jobs_order_id_direction_idx" ON "delivery_jobs"("order_id", "direction");
CREATE INDEX "delivery_jobs_shop_id_status_scheduled_at_idx" ON "delivery_jobs"("shop_id", "status", "scheduled_at");
CREATE INDEX "reminders_shop_id_status_scheduled_for_idx" ON "reminders"("shop_id", "status", "scheduled_for");
CREATE INDEX "notification_logs_shop_id_status_created_at_idx" ON "notification_logs"("shop_id", "status", "created_at");
CREATE INDEX "audit_logs_shop_id_entity_type_entity_id_created_at_idx" ON "audit_logs"("shop_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
