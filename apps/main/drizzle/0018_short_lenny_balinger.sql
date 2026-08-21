CREATE TABLE `linear_issue_embeddings` (
	`issue_id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`identifier` text NOT NULL,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`content_hash` text NOT NULL,
	`vector` blob NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_linear_issue_embeddings_team` ON `linear_issue_embeddings` (`team_id`);