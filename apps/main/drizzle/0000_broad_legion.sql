CREATE TABLE `claude_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_claude_messages_workspace_session` ON `claude_messages` (`workspace_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`name` text PRIMARY KEY NOT NULL,
	`ciphertext` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_root` text NOT NULL,
	`worktree_path` text NOT NULL,
	`branch` text NOT NULL,
	`linear_issue` text,
	`claude_state` text DEFAULT 'idle' NOT NULL,
	`claude_session_id` text,
	`created_at` text NOT NULL
);
