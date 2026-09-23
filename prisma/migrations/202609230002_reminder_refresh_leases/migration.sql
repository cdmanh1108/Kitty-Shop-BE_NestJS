-- Coordinates full per-shop reminder refreshes across application workers.
CREATE TABLE "scheduler_job_leases" (
    "job_key" VARCHAR(200) NOT NULL,
    "owner_token" VARCHAR(64) NOT NULL,
    "lease_until" TIMESTAMPTZ(6) NOT NULL,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scheduler_job_leases_pkey" PRIMARY KEY ("job_key")
);
