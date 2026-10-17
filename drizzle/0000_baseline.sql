CREATE TABLE "film_budgets" (
	"payer" text PRIMARY KEY NOT NULL,
	"daily_limit" bigint DEFAULT 10000000 NOT NULL,
	"paused" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "film_budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "films" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"payer" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" text NOT NULL,
	"provider_id" text,
	"status_url" text,
	"cancel_url" text,
	"result_key" text,
	"estimate" bigint DEFAULT 0 NOT NULL,
	"reserved_day" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "films" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "image_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"payer" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" text NOT NULL,
	"provider_id" text,
	"estimate" bigint DEFAULT 0 NOT NULL,
	"reserved_day" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "image_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storyboards" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"data" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	"lock_token" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storyboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "swap_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"payer" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" text NOT NULL,
	"provider_id" text,
	"status_url" text,
	"cancel_url" text,
	"result_key" text,
	"estimate" bigint DEFAULT 0 NOT NULL,
	"reserved_day" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "swap_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "topaz_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"parent_id" text NOT NULL,
	"status" text NOT NULL,
	"data" text NOT NULL,
	"provider_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "topaz_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "films_owner_created" ON "films" USING btree ("owner","created_at");--> statement-breakpoint
CREATE INDEX "films_payer_day" ON "films" USING btree ("payer","reserved_day");--> statement-breakpoint
CREATE INDEX "image_jobs_owner_created" ON "image_jobs" USING btree ("owner","created_at");--> statement-breakpoint
CREATE INDEX "image_jobs_payer_day" ON "image_jobs" USING btree ("payer","reserved_day");--> statement-breakpoint
CREATE INDEX "storyboards_owner_created" ON "storyboards" USING btree ("owner","created_at");--> statement-breakpoint
CREATE INDEX "swaps_owner_created" ON "swap_jobs" USING btree ("owner","created_at");--> statement-breakpoint
CREATE INDEX "swaps_payer_day" ON "swap_jobs" USING btree ("payer","reserved_day");--> statement-breakpoint
CREATE INDEX "topaz_jobs_owner_parent" ON "topaz_jobs" USING btree ("owner","parent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "topaz_jobs_one_active" ON "topaz_jobs" USING btree ("owner","parent_id") WHERE status IN ('submitting','unknown','queued','processing','archiving');