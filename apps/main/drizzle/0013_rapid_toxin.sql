CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_events_type` ON `activity_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_activity_events_created` ON `activity_events` (`created_at`);