-- Generated from the release Prisma schema; custom PostgreSQL invariants follow.
-- Required extensions: pgcrypto, btree_gist, pg_trgm, unaccent.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RentalOrderSource" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "customer_loyalty_owner_type" AS ENUM ('CRM_CUSTOMER', 'WEB_ACCOUNT');

-- CreateEnum
CREATE TYPE "customer_loyalty_reward_status" AS ENUM ('AVAILABLE', 'REDEEMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "web_otp_delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "web_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "full_name" VARCHAR(100),
    "contact_phone" VARCHAR(10),
    "password_hash" TEXT NOT NULL,
    "pending_password_hash" TEXT,
    "registration_attempt_id" UUID,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_otp_challenges" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "otp_hash" CHAR(64) NOT NULL,
    "registration_attempt_id" UUID,
    "delivery_status" "web_otp_delivery_status" NOT NULL DEFAULT 'SENT',
    "retry_anchor_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "parent_token_id" UUID,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(50),
    "user_agent" TEXT,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_refresh_token_families" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(50),
    "reuse_detected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_refresh_token_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "pickup_date" TIMESTAMPTZ(6) NOT NULL,
    "return_date" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
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
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
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
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shop_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "password_hash" TEXT,
    "full_name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_code" VARCHAR(50),
    "display_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shop_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_roles" (
    "member_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_roles_pkey" PRIMARY KEY ("member_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "parent_token_id" UUID,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(50),
    "user_agent" TEXT,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token_families" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(50),
    "reuse_detected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
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
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
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
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255),
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sizes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "hex_color" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "allow_free_accessory" BOOLEAN NOT NULL DEFAULT false,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "default_deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "replacement_value" DECIMAL(18,2),
    "facebook_post_url" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "is_rentable" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_code" VARCHAR(100) NOT NULL,
    "size_id" UUID,
    "color_id" UUID,
    "deposit_amount_override" DECIMAL(18,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "media_type" VARCHAR(20) NOT NULL DEFAULT 'IMAGE',
    "storage_key" TEXT,
    "url" TEXT NOT NULL,
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID,
    "sku" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(100),
    "current_status" VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    "condition" VARCHAR(30) NOT NULL DEFAULT 'GOOD',
    "purchase_price" DECIMAL(18,2),
    "purchase_date" DATE,
    "acquired_from" VARCHAR(255),
    "total_rental_count" INTEGER NOT NULL DEFAULT 0,
    "last_rented_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "source" "RentalOrderSource" NOT NULL,
    "web_account_id" UUID,
    "notification_email" VARCHAR(255),
    "location_id" UUID,
    "rental_start_at" TIMESTAMPTZ(6) NOT NULL,
    "rental_end_at" TIMESTAMPTZ(6) NOT NULL,
    "actual_started_at" TIMESTAMPTZ(6),
    "actual_returned_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "status" VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
    "payment_status" VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
    "preferred_payment_method" VARCHAR(30),
    "deposit_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "rental_subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "charges_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposit_required" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "collateral_method" VARCHAR(20) NOT NULL DEFAULT 'CASH',
    "document_type" VARCHAR(20),
    "collateral_status" VARCHAR(20) NOT NULL DEFAULT 'REQUIRED',
    "collateral_received_at" TIMESTAMPTZ(6),
    "collateral_returned_at" TIMESTAMPTZ(6),
    "grand_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "internal_note" TEXT,
    "metadata" JSONB,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_confirmations" (
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_by" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_name" VARCHAR(255) NOT NULL,
    "rental_amount" DECIMAL(18,2) NOT NULL,
    "collateral_method" VARCHAR(20) NOT NULL,
    "document_type" VARCHAR(20),
    "collateral_amount" DECIMAL(18,2),
    "note" VARCHAR(2000),
    "evidence_key" VARCHAR(500),
    "evidence_filename" VARCHAR(255),
    "evidence_mime_type" VARCHAR(100),
    "evidence_size" INTEGER,

    CONSTRAINT "rental_confirmations_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "rental_returns" (
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "returned_at" TIMESTAMPTZ(6) NOT NULL,
    "received_by" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_name" VARCHAR(255) NOT NULL,
    "late_days" INTEGER NOT NULL DEFAULT 0,
    "late_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "additional_rental" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_returns_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "rental_return_inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "condition" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "calculated_late_fee" DECIMAL(18,2),
    "calculated_additional_rental" DECIMAL(18,2),
    "late_fee" DECIMAL(18,2),
    "additional_rental" DECIMAL(18,2),
    "fee_override_reason" VARCHAR(2000),
    "pricing_version" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_return_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_settlements" (
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "settled_at" TIMESTAMPTZ(6) NOT NULL,
    "settled_by" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_name" VARCHAR(255) NOT NULL,
    "settlement_type" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_charges" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount_due" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(2000),
    "evidence_key" VARCHAR(500),
    "evidence_filename" VARCHAR(255),
    "evidence_mime_type" VARCHAR(100),
    "evidence_size" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_settlements_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "customer_loyalty_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "entry_type" VARCHAR(20) NOT NULL,
    "owner_type" "customer_loyalty_owner_type" NOT NULL DEFAULT 'CRM_CUSTOMER',
    "web_account_id" UUID,
    "reward_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_loyalty_rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "owner_type" "customer_loyalty_owner_type" NOT NULL,
    "web_account_id" UUID,
    "earned_entry_id" UUID NOT NULL,
    "earned_order_id" UUID NOT NULL,
    "reward_value" DECIMAL(18,2) NOT NULL,
    "status" "customer_loyalty_reward_status" NOT NULL DEFAULT 'AVAILABLE',
    "redeemed_order_id" UUID,
    "redeemed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "billing_role" VARCHAR(30) NOT NULL DEFAULT 'PAID',
    "allow_free_accessory_snapshot" BOOLEAN,
    "rental_start_at" TIMESTAMPTZ(6) NOT NULL,
    "rental_end_at" TIMESTAMPTZ(6) NOT NULL,
    "product_name_snapshot" VARCHAR(255) NOT NULL,
    "variant_name_snapshot" VARCHAR(255) NOT NULL,
    "sku_snapshot" VARCHAR(100),
    "unit_rental_price" DECIMAL(18,2) NOT NULL,
    "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "pricing_snapshot" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_item_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "reserved_from" TIMESTAMPTZ(6) NOT NULL,
    "reserved_until" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'HELD',
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_item_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_order_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID,
    "charge_type" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,

    CONSTRAINT "rental_order_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(100),
    "note" TEXT,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(100),
    "order_id" UUID,
    "notes" TEXT,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "source" VARCHAR(30) NOT NULL DEFAULT 'ADMIN_MANUAL',
    "receipt_key" VARCHAR(100),
    "provider" VARCHAR(50),
    "provider_transaction_id" VARCHAR(255),
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "transaction_number" VARCHAR(50) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "purpose" VARCHAR(30) NOT NULL,
    "payment_method" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
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

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "expense_number" VARCHAR(50) NOT NULL,
    "category_id" UUID NOT NULL,
    "order_id" UUID,
    "inventory_item_id" UUID,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "payment_method" VARCHAR(30),
    "vendor_name" VARCHAR(255),
    "expense_date" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "receipt_url" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PAID',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "voided_at" TIMESTAMPTZ(6),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
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
    "shipping_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tracking_code" VARCHAR(255),
    "notes" TEXT,
    "metadata" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID,
    "customer_id" UUID,
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

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_job_leases" (
    "job_key" VARCHAR(200) NOT NULL,
    "owner_token" VARCHAR(64) NOT NULL,
    "lease_until" TIMESTAMPTZ(6) NOT NULL,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scheduler_job_leases_pkey" PRIMARY KEY ("job_key")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "reminder_id" UUID,
    "customer_id" UUID,
    "order_id" UUID,
    "event_id" UUID,
    "event_sequence" INTEGER,
    "payload" JSONB,
    "from_address" VARCHAR(400),
    "subject" VARCHAR(255),
    "html" TEXT,
    "owner_token" UUID,
    "lease_until" TIMESTAMPTZ(6),
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" TIMESTAMPTZ(6),
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "key" VARCHAR(150) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_member_id" UUID,
    "actor_web_account_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(128),
    "response_code" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_accounts_email_key" ON "web_accounts"("email");

-- CreateIndex
CREATE INDEX "web_otp_challenges_account_id_created_at_idx" ON "web_otp_challenges"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "web_otp_challenges_expires_at_idx" ON "web_otp_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "web_refresh_tokens_parent_token_id_key" ON "web_refresh_tokens"("parent_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "web_refresh_tokens_token_hash_key" ON "web_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "web_refresh_tokens_account_id_idx" ON "web_refresh_tokens"("account_id");

-- CreateIndex
CREATE INDEX "web_refresh_tokens_family_id_revoked_at_idx" ON "web_refresh_tokens"("family_id", "revoked_at");

-- CreateIndex
CREATE INDEX "web_refresh_tokens_expires_at_idx" ON "web_refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "web_refresh_token_families_account_id_revoked_at_idx" ON "web_refresh_token_families"("account_id", "revoked_at");

-- CreateIndex
CREATE INDEX "carts_shop_id_updated_at_idx" ON "carts"("shop_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "carts_account_id_shop_id_key" ON "carts"("account_id", "shop_id");

-- CreateIndex
CREATE INDEX "favorites_account_id_created_at_idx" ON "favorites"("account_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "favorites_account_id_product_id_key" ON "favorites"("account_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_code_key" ON "shops"("code");

-- CreateIndex
CREATE INDEX "shop_locations_shop_id_is_active_idx" ON "shop_locations"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "shop_locations_shop_id_code_key" ON "shop_locations"("shop_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "shop_members_user_id_status_idx" ON "shop_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shop_members_shop_id_user_id_key" ON "shop_members"("shop_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_members_shop_id_employee_code_key" ON "shop_members"("shop_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_shop_id_code_key" ON "roles"("shop_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_parent_token_id_key" ON "refresh_tokens"("parent_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_revoked_at_idx" ON "refresh_tokens"("family_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_token_families_user_id_revoked_at_idx" ON "refresh_token_families"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_token_families_member_id_revoked_at_idx" ON "refresh_token_families"("member_id", "revoked_at");

-- CreateIndex
CREATE INDEX "customers_shop_id_full_name_idx" ON "customers"("shop_id", "full_name");

-- CreateIndex
CREATE INDEX "customers_shop_id_status_idx" ON "customers"("shop_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shop_id_customer_code_key" ON "customers"("shop_id", "customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shop_id_normalized_phone_key" ON "customers"("shop_id", "normalized_phone");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_is_default_idx" ON "customer_addresses"("customer_id", "is_default");

-- CreateIndex
CREATE INDEX "customer_notes_customer_id_is_pinned_idx" ON "customer_notes"("customer_id", "is_pinned");

-- CreateIndex
CREATE INDEX "categories_shop_id_is_active_sort_order_idx" ON "categories"("shop_id", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "categories_shop_id_slug_idx" ON "categories"("shop_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_shop_id_code_key" ON "categories"("shop_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sizes_shop_id_code_key" ON "sizes"("shop_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "colors_shop_id_code_key" ON "colors"("shop_id", "code");

-- CreateIndex
CREATE INDEX "products_shop_id_category_id_status_idx" ON "products"("shop_id", "category_id", "status");

-- CreateIndex
CREATE INDEX "products_shop_id_name_idx" ON "products"("shop_id", "name");

-- CreateIndex
CREATE INDEX "products_shop_id_status_is_public_is_rentable_archived_at_c_idx" ON "products"("shop_id", "status", "is_public", "is_rentable", "archived_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "products_shop_free_accessory_visibility_idx" ON "products"("shop_id", "allow_free_accessory", "status", "is_public", "is_rentable", "archived_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_id_code_key" ON "products"("shop_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_id_slug_key" ON "products"("shop_id", "slug");

-- CreateIndex
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_shop_id_variant_code_key" ON "product_variants"("shop_id", "variant_code");

-- CreateIndex
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_media_product_id_is_primary_sort_order_idx" ON "product_media"("product_id", "is_primary" DESC, "sort_order" ASC);

-- CreateIndex
CREATE INDEX "inventory_items_shop_id_current_status_idx" ON "inventory_items"("shop_id", "current_status");

-- CreateIndex
CREATE INDEX "inventory_items_variant_id_is_active_idx" ON "inventory_items"("variant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_shop_id_sku_key" ON "inventory_items"("shop_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_shop_id_barcode_key" ON "inventory_items"("shop_id", "barcode");

-- CreateIndex
CREATE INDEX "rental_orders_shop_id_rental_start_at_rental_end_at_idx" ON "rental_orders"("shop_id", "rental_start_at", "rental_end_at");

-- CreateIndex
CREATE INDEX "rental_orders_shop_id_status_idx" ON "rental_orders"("shop_id", "status");

-- CreateIndex
CREATE INDEX "rental_orders_customer_id_created_at_idx" ON "rental_orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "rental_orders_web_account_id_created_at_idx" ON "rental_orders"("web_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "rental_orders_shop_id_status_completed_at_idx" ON "rental_orders"("shop_id", "status", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_orders_shop_id_order_number_key" ON "rental_orders"("shop_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "rental_confirmations_evidence_key_key" ON "rental_confirmations"("evidence_key");

-- CreateIndex
CREATE INDEX "rental_confirmations_shop_id_confirmed_at_idx" ON "rental_confirmations"("shop_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "rental_returns_shop_id_returned_at_idx" ON "rental_returns"("shop_id", "returned_at");

-- CreateIndex
CREATE INDEX "rental_return_inspections_order_id_idx" ON "rental_return_inspections"("order_id");

-- CreateIndex
CREATE INDEX "rental_return_inspections_inventory_item_id_idx" ON "rental_return_inspections"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_settlements_evidence_key_key" ON "rental_settlements"("evidence_key");

-- CreateIndex
CREATE INDEX "rental_settlements_shop_id_settled_at_idx" ON "rental_settlements"("shop_id", "settled_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_entries_order_id_key" ON "customer_loyalty_entries"("order_id");

-- CreateIndex
CREATE INDEX "customer_loyalty_entries_shop_id_owner_customer_created_at_idx" ON "customer_loyalty_entries"("shop_id", "owner_type", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_loyalty_entries_shop_id_owner_account_created_at_idx" ON "customer_loyalty_entries"("shop_id", "owner_type", "web_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_rewards_earned_entry_id_key" ON "customer_loyalty_rewards"("earned_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_rewards_earned_order_id_key" ON "customer_loyalty_rewards"("earned_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_rewards_redeemed_order_id_key" ON "customer_loyalty_rewards"("redeemed_order_id");

-- CreateIndex
CREATE INDEX "customer_loyalty_rewards_customer_status_idx" ON "customer_loyalty_rewards"("shop_id", "owner_type", "customer_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "customer_loyalty_rewards_account_status_idx" ON "customer_loyalty_rewards"("shop_id", "owner_type", "web_account_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "rental_order_items_order_id_idx" ON "rental_order_items"("order_id");

-- CreateIndex
CREATE INDEX "rental_order_items_variant_id_rental_start_at_rental_end_at_idx" ON "rental_order_items"("variant_id", "rental_start_at", "rental_end_at");

-- CreateIndex
CREATE INDEX "rental_item_allocations_inventory_item_id_reserved_from_res_idx" ON "rental_item_allocations"("inventory_item_id", "reserved_from", "reserved_until");

-- CreateIndex
CREATE INDEX "rental_item_allocations_order_id_status_idx" ON "rental_item_allocations"("order_id", "status");

-- CreateIndex
CREATE INDEX "rental_item_allocations_shop_id_status_released_at_idx" ON "rental_item_allocations"("shop_id", "status", "released_at");

-- CreateIndex
CREATE INDEX "rental_order_charges_order_id_charge_type_idx" ON "rental_order_charges"("order_id", "charge_type");

-- CreateIndex
CREATE INDEX "rental_order_status_history_order_id_changed_at_idx" ON "rental_order_status_history"("order_id", "changed_at");

-- CreateIndex
CREATE INDEX "inventory_status_history_inventory_item_id_changed_at_idx" ON "inventory_status_history"("inventory_item_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_receipt_key_key" ON "payment_transactions"("receipt_key");

-- CreateIndex
CREATE INDEX "payment_transactions_order_id_paid_at_idx" ON "payment_transactions"("order_id", "paid_at");

-- CreateIndex
CREATE INDEX "payment_transactions_shop_id_paid_at_status_idx" ON "payment_transactions"("shop_id", "paid_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_shop_id_transaction_number_key" ON "payment_transactions"("shop_id", "transaction_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_provider_transaction_id_key" ON "payment_transactions"("provider", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_shop_id_code_key" ON "expense_categories"("shop_id", "code");

-- CreateIndex
CREATE INDEX "expenses_shop_id_expense_date_status_idx" ON "expenses"("shop_id", "expense_date", "status");

-- CreateIndex
CREATE INDEX "expenses_order_id_idx" ON "expenses"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_shop_id_expense_number_key" ON "expenses"("shop_id", "expense_number");

-- CreateIndex
CREATE INDEX "delivery_jobs_order_id_direction_idx" ON "delivery_jobs"("order_id", "direction");

-- CreateIndex
CREATE INDEX "delivery_jobs_shop_id_status_scheduled_at_idx" ON "delivery_jobs"("shop_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "reminders_shop_id_status_scheduled_for_idx" ON "reminders"("shop_id", "status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_shop_id_dedupe_key_key" ON "reminders"("shop_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_event_id_key" ON "notification_logs"("event_id");

-- CreateIndex
CREATE INDEX "notification_logs_shop_id_status_created_at_idx" ON "notification_logs"("shop_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_channel_status_available_at_idx" ON "notification_logs"("channel", "status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_shop_id_key_key" ON "app_settings"("shop_id", "key");

-- CreateIndex
CREATE INDEX "audit_logs_shop_id_entity_type_entity_id_created_at_idx" ON "audit_logs"("shop_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_web_account_id_created_at_idx" ON "audit_logs"("actor_web_account_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_shop_id_scope_key_key" ON "idempotency_records"("shop_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "web_otp_challenges" ADD CONSTRAINT "web_otp_challenges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_refresh_tokens" ADD CONSTRAINT "web_refresh_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_refresh_tokens" ADD CONSTRAINT "web_refresh_tokens_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "web_refresh_token_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_refresh_tokens" ADD CONSTRAINT "web_refresh_tokens_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "web_refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_refresh_token_families" ADD CONSTRAINT "web_refresh_token_families_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_locations" ADD CONSTRAINT "shop_locations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "shop_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "shop_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "refresh_token_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "shop_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sizes" ADD CONSTRAINT "sizes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colors" ADD CONSTRAINT "colors_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "shop_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_web_account_id_fkey" FOREIGN KEY ("web_account_id") REFERENCES "web_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "shop_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_confirmations" ADD CONSTRAINT "rental_confirmations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_confirmations" ADD CONSTRAINT "rental_confirmations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_confirmations" ADD CONSTRAINT "rental_confirmations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_confirmations" ADD CONSTRAINT "rental_confirmations_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "shop_members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_returns" ADD CONSTRAINT "rental_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_returns" ADD CONSTRAINT "rental_returns_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_returns" ADD CONSTRAINT "rental_returns_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_returns" ADD CONSTRAINT "rental_returns_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "shop_members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_return_inspections" ADD CONSTRAINT "rental_return_inspections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_returns"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_return_inspections" ADD CONSTRAINT "rental_return_inspections_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_settlements" ADD CONSTRAINT "rental_settlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_settlements" ADD CONSTRAINT "rental_settlements_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_settlements" ADD CONSTRAINT "rental_settlements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rental_settlements" ADD CONSTRAINT "rental_settlements_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "shop_members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_web_account_id_fkey" FOREIGN KEY ("web_account_id") REFERENCES "web_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_rewards" ADD CONSTRAINT "customer_loyalty_rewards_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_rewards" ADD CONSTRAINT "customer_loyalty_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_rewards" ADD CONSTRAINT "customer_loyalty_rewards_web_account_id_fkey" FOREIGN KEY ("web_account_id") REFERENCES "web_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_rewards" ADD CONSTRAINT "customer_loyalty_rewards_earned_entry_id_fkey" FOREIGN KEY ("earned_entry_id") REFERENCES "customer_loyalty_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_rewards" ADD CONSTRAINT "customer_loyalty_rewards_earned_order_id_fkey" FOREIGN KEY ("earned_order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_rewards" ADD CONSTRAINT "customer_loyalty_rewards_redeemed_order_id_fkey" FOREIGN KEY ("redeemed_order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_items" ADD CONSTRAINT "rental_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item_allocations" ADD CONSTRAINT "rental_item_allocations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item_allocations" ADD CONSTRAINT "rental_item_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item_allocations" ADD CONSTRAINT "rental_item_allocations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "rental_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item_allocations" ADD CONSTRAINT "rental_item_allocations_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_charges" ADD CONSTRAINT "rental_order_charges_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_charges" ADD CONSTRAINT "rental_order_charges_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_charges" ADD CONSTRAINT "rental_order_charges_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "rental_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_status_history" ADD CONSTRAINT "rental_order_status_history_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_order_status_history" ADD CONSTRAINT "rental_order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_status_history" ADD CONSTRAINT "inventory_status_history_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_status_history" ADD CONSTRAINT "inventory_status_history_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_status_history" ADD CONSTRAINT "inventory_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_web_account_id_fkey" FOREIGN KEY ("actor_web_account_id") REFERENCES "web_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Application invariants not expressible in Prisma schema.
ALTER TABLE "products"
  ADD CONSTRAINT "products_default_deposit_amount_check" CHECK ("default_deposit_amount" >= 0);
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_deposit_amount_override_check"
    CHECK ("deposit_amount_override" IS NULL OR "deposit_amount_override" >= 0);
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_purchase_price_check"
    CHECK ("purchase_price" IS NULL OR "purchase_price" >= 0),
  ADD CONSTRAINT "inventory_items_total_rental_count_check" CHECK ("total_rental_count" >= 0),
  ADD CONSTRAINT "inventory_items_operational_status_check"
    CHECK ("current_status" IN ('AVAILABLE', 'CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'));
ALTER TABLE "rental_orders"
  ADD CONSTRAINT "rental_orders_amounts_nonnegative_check" CHECK (
    "rental_subtotal" >= 0 AND "charges_total" >= 0 AND "discount_total" >= 0
    AND "deposit_required" >= 0 AND "grand_total" >= 0
  ),
  ADD CONSTRAINT "rental_orders_period_check" CHECK ("rental_end_at" > "rental_start_at"),
  ADD CONSTRAINT "rental_orders_preferred_payment_method_check" CHECK (
    "preferred_payment_method" IS NULL
    OR "preferred_payment_method" IN ('cash', 'bank_transfer')
  );
ALTER TABLE "rental_confirmations"
  ADD CONSTRAINT "rental_confirmations_rental_amount_check" CHECK ("rental_amount" >= 0),
  ADD CONSTRAINT "confirmation_collateral_check" CHECK (
    ("collateral_method" = 'CASH' AND "document_type" IS NULL AND "collateral_amount" IS NOT NULL AND "collateral_amount" >= 0)
    OR ("collateral_method" = 'DOCUMENT' AND "document_type" IN ('CCCD', 'GPLX') AND "collateral_amount" IS NULL)
  ),
  ADD CONSTRAINT "confirmation_evidence_check" CHECK (
    ("evidence_key" IS NULL AND "evidence_filename" IS NULL AND "evidence_mime_type" IS NULL AND "evidence_size" IS NULL)
    OR ("evidence_key" IS NOT NULL AND "evidence_filename" IS NOT NULL AND "evidence_mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif') AND "evidence_size" > 0 AND "evidence_size" <= 15728640)
  );
ALTER TABLE "rental_returns"
  ADD CONSTRAINT "rental_returns_amounts_nonnegative_check"
    CHECK ("late_days" >= 0 AND "late_fee" >= 0 AND "additional_rental" >= 0);
ALTER TABLE "rental_return_inspections"
  ADD CONSTRAINT "rental_return_inspections_condition_check"
    CHECK ("condition" IN ('NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST')),
  ADD CONSTRAINT "return_inspection_fee_nonnegative" CHECK (
    ("calculated_late_fee" IS NULL OR "calculated_late_fee" >= 0)
    AND ("calculated_additional_rental" IS NULL OR "calculated_additional_rental" >= 0)
    AND ("late_fee" IS NULL OR "late_fee" >= 0)
    AND ("additional_rental" IS NULL OR "additional_rental" >= 0)
  ),
  ADD CONSTRAINT "return_inspection_override_reason" CHECK (
    "fee_override_reason" IS NULL OR length(btrim("fee_override_reason")) > 0
  ),
  ADD CONSTRAINT "return_inspection_fee_snapshot" CHECK (
    ("calculated_late_fee" IS NULL AND "calculated_additional_rental" IS NULL AND "late_fee" IS NULL AND "additional_rental" IS NULL AND "pricing_version" IS NULL AND "fee_override_reason" IS NULL)
    OR
    ("calculated_late_fee" IS NOT NULL AND "calculated_additional_rental" IS NOT NULL AND "late_fee" IS NOT NULL AND "additional_rental" IS NOT NULL AND "pricing_version" IN ('CYCLE_V1', 'FREE_ACCESSORY_V1')
      AND ("fee_override_reason" IS NOT NULL OR ("late_fee" = "calculated_late_fee" AND "additional_rental" = "calculated_additional_rental")))
  ),
  ADD CONSTRAINT "return_inspection_free_fee" CHECK (
    "pricing_version" IS DISTINCT FROM 'FREE_ACCESSORY_V1'
    OR ("calculated_late_fee" = 0 AND "calculated_additional_rental" = 0 AND "late_fee" = 0 AND "additional_rental" = 0 AND "fee_override_reason" IS NULL)
  );
ALTER TABLE "rental_settlements"
  ADD CONSTRAINT "rental_settlements_amounts_nonnegative_check" CHECK (
    "amount" >= 0 AND "deposit_amount" >= 0 AND "total_charges" >= 0 AND "refund_amount" >= 0 AND "amount_due" >= 0
  ),
  ADD CONSTRAINT "rental_settlements_settlement_type_check"
    CHECK ("settlement_type" IN ('REFUND', 'PAYMENT', 'COLLECTION', 'BALANCED', 'COLLATERAL_ONLY')),
  ADD CONSTRAINT "settlement_evidence_check" CHECK (
    ("evidence_key" IS NULL AND "evidence_filename" IS NULL AND "evidence_mime_type" IS NULL AND "evidence_size" IS NULL)
    OR ("evidence_key" IS NOT NULL AND "evidence_filename" IS NOT NULL AND "evidence_mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif') AND "evidence_size" > 0 AND "evidence_size" <= 15728640)
  );
ALTER TABLE "customer_loyalty_entries"
  ADD CONSTRAINT "customer_loyalty_entries_owner_check" CHECK (
    ("owner_type" = 'CRM_CUSTOMER' AND "web_account_id" IS NULL)
    OR ("owner_type" = 'WEB_ACCOUNT' AND "web_account_id" IS NOT NULL)
  );
ALTER TABLE "customer_loyalty_rewards"
  ADD CONSTRAINT "customer_loyalty_rewards_reward_value_check" CHECK ("reward_value" > 0),
  ADD CONSTRAINT "customer_loyalty_rewards_owner_check" CHECK (
    ("owner_type" = 'CRM_CUSTOMER' AND "web_account_id" IS NULL)
    OR ("owner_type" = 'WEB_ACCOUNT' AND "web_account_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "customer_loyalty_rewards_status_check" CHECK (
    ("status" = 'AVAILABLE' AND "redeemed_order_id" IS NULL AND "redeemed_at" IS NULL)
    OR ("status" = 'REDEEMED' AND "redeemed_order_id" IS NOT NULL AND "redeemed_at" IS NOT NULL)
    OR "status" = 'REVOKED'
  );
ALTER TABLE "rental_order_items"
  ADD CONSTRAINT "rental_order_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "rental_order_items_period_check" CHECK ("rental_end_at" > "rental_start_at"),
  ADD CONSTRAINT "rental_order_items_amounts_nonnegative_check" CHECK (
    "unit_rental_price" >= 0 AND "deposit_amount" >= 0 AND "discount_amount" >= 0 AND "line_total" >= 0
  ),
  ADD CONSTRAINT "rental_order_items_billing_role_check" CHECK ("billing_role" IN ('PAID', 'FREE_ACCESSORY')),
  ADD CONSTRAINT "rental_order_items_free_accessory_check" CHECK (
    "billing_role" <> 'FREE_ACCESSORY'
    OR ("allow_free_accessory_snapshot" IS TRUE AND "unit_rental_price" = 0 AND "line_total" = 0 AND "deposit_amount" = 0 AND "discount_amount" = 0)
  );
ALTER TABLE "rental_item_allocations"
  ADD CONSTRAINT "rental_item_allocations_period_check" CHECK ("reserved_until" > "reserved_from"),
  ADD CONSTRAINT "rental_item_no_overlap" EXCLUDE USING gist (
    "inventory_item_id" WITH =,
    tstzrange("reserved_from", "reserved_until", '[)') WITH &&
  ) WHERE ("status" IN ('HELD', 'CONFIRMED', 'ACTIVE'));
ALTER TABLE "rental_order_charges"
  ADD CONSTRAINT "rental_order_charges_amount_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "rental_order_charges_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "payment_source_check" CHECK ("source" IN ('ADMIN_MANUAL', 'INTERNAL_TRANSFER'));
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0);
ALTER TABLE "delivery_jobs"
  ADD CONSTRAINT "delivery_jobs_shipping_fee_check" CHECK ("shipping_fee" >= 0);
ALTER TABLE "carts"
  ADD CONSTRAINT "carts_valid_period" CHECK ("pickup_date" < "return_date"),
  ADD CONSTRAINT "carts_non_negative_version" CHECK ("version" > 0);
ALTER TABLE "web_accounts"
  ADD CONSTRAINT "web_accounts_email_canonical"
    CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
  ADD CONSTRAINT "web_accounts_full_name_check"
    CHECK ("full_name" IS NULL OR ("full_name" = btrim("full_name") AND char_length("full_name") BETWEEN 2 AND 100)),
  ADD CONSTRAINT "web_accounts_contact_phone_check"
    CHECK ("contact_phone" IS NULL OR "contact_phone" ~ '^0[0-9]{9}$');
ALTER TABLE "web_otp_challenges"
  ADD CONSTRAINT "web_otp_challenges_attempt_count_check" CHECK ("attempt_count" >= 0);
ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_attempt_count_check" CHECK ("attempt_count" >= 0);
ALTER TABLE "notification_logs"
  ADD CONSTRAINT "notification_logs_email_queue_check" CHECK (
    "event_id" IS NULL OR (
      "channel" = 'EMAIL' AND "order_id" IS NOT NULL AND "recipient" IS NOT NULL AND "payload" IS NOT NULL
      AND "event_sequence" IN (2, 4)
      AND "template_code" IN ('RENTAL_WEB_CONFIRMED', 'RENTAL_WEB_COMPLETED')
      AND "attempt_count" >= 0
      AND "status" IN ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED', 'UNKNOWN')
      AND (("status" = 'PROCESSING' AND "owner_token" IS NOT NULL AND "lease_until" IS NOT NULL)
        OR ("status" <> 'PROCESSING' AND "owner_token" IS NULL AND "lease_until" IS NULL))
    ) IS TRUE
  );

-- SQL-only indexes retained by active query and uniqueness paths.
CREATE INDEX "customers_full_name_trgm_idx" ON "customers" USING GIN ("full_name" gin_trgm_ops);
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE UNIQUE INDEX "product_variants_unarchived_combination_unique"
  ON "product_variants" ("product_id", "size_id", "color_id") NULLS NOT DISTINCT
  WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "product_media_product_id_primary_unique"
  ON "product_media" ("product_id") WHERE "is_primary" = true;
CREATE UNIQUE INDEX "web_otp_challenges_one_pending"
  ON "web_otp_challenges" ("account_id") WHERE "consumed_at" IS NULL;
CREATE INDEX "idx_products_storefront_active"
  ON "products" ("shop_id", "status", "is_public", "is_rentable", "archived_at", "created_at" DESC);
CREATE INDEX "web_otp_challenges_account_attempt_idx"
  ON "web_otp_challenges" ("account_id", "registration_attempt_id");
CREATE INDEX "refresh_tokens_family_terminal_at_idx"
  ON "refresh_tokens" ("family_id", (COALESCE("revoked_at", "expires_at")));
CREATE INDEX "refresh_token_families_terminal_at_idx"
  ON "refresh_token_families" ((COALESCE("reuse_detected_at", "revoked_at", "created_at")));
CREATE INDEX "web_refresh_tokens_family_terminal_at_idx"
  ON "web_refresh_tokens" ("family_id", (COALESCE("revoked_at", "expires_at")));
CREATE INDEX "web_refresh_token_families_terminal_at_idx"
  ON "web_refresh_token_families" ((COALESCE("reuse_detected_at", "revoked_at", "created_at")));
CREATE INDEX "web_otp_challenges_terminal_at_idx"
  ON "web_otp_challenges" ((COALESCE("consumed_at", "expires_at")));
CREATE UNIQUE INDEX "notification_logs_order_email_template_key"
  ON "notification_logs" ("order_id", "template_code")
  WHERE "event_id" IS NOT NULL AND "channel" = 'EMAIL';

COMMIT;
