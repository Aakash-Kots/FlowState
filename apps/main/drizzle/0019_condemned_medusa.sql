CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transport` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`command` text,
	`args` text,
	`url` text,
	`env_keys` text DEFAULT '[]' NOT NULL,
	`header_keys` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
