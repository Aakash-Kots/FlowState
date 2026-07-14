CREATE TABLE `usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`tab_id` text,
	`session_id` text NOT NULL,
	`model` text,
	`cost_usd` real NOT NULL,
	`duration_ms` integer,
	`num_turns` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_tokens` integer,
	`cache_creation_tokens` integer,
	`is_error` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_usage_events_workspace` ON `usage_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_created` ON `usage_events` (`created_at`);