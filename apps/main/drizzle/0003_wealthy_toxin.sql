CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`full_name` text NOT NULL,
	`clone_url` text NOT NULL,
	`local_path` text NOT NULL,
	`default_branch` text NOT NULL,
	`private` integer NOT NULL,
	`created_at` text NOT NULL
);
