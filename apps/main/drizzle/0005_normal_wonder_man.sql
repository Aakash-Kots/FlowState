CREATE TABLE `terminal_tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'shell' NOT NULL,
	`command` text,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_terminal_tabs_workspace` ON `terminal_tabs` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `setup_script` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `run_script` text;