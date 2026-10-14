CREATE TABLE `storyboards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storyboards_owner_created` ON `storyboards` (`owner`,`created_at`);