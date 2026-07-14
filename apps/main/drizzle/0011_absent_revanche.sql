CREATE TABLE `pinned_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`workspace_id` text,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pinned_skills_project` ON `pinned_skills` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_pinned_skills_workspace` ON `pinned_skills` (`workspace_id`);