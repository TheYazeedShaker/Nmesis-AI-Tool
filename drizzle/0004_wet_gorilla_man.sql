CREATE TABLE `topaz_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`parent_id` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`provider_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `topaz_jobs_owner_parent` ON `topaz_jobs` (`owner`,`parent_id`,`created_at`);