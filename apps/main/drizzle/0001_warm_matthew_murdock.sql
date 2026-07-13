CREATE TABLE `tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`claude_session_id` text,
	`claude_state` text DEFAULT 'idle' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tabs_workspace` ON `tabs` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `claude_messages` ADD `tab_id` text REFERENCES tabs(id);--> statement-breakpoint
CREATE INDEX `idx_claude_messages_tab` ON `claude_messages` (`tab_id`);