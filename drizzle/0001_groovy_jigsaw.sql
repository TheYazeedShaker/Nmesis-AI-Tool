CREATE TABLE `swap_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`payer` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data` text NOT NULL,
	`provider_id` text,
	`status_url` text,
	`cancel_url` text,
	`result_key` text,
	`estimate` integer DEFAULT 0 NOT NULL,
	`reserved_day` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `swaps_owner_created` ON `swap_jobs` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `swaps_payer_day` ON `swap_jobs` (`payer`,`reserved_day`);