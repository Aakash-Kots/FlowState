CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`body` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notes_workspace` ON `notes` (`workspace_id`);