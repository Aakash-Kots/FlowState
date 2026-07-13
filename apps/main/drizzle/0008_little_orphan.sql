ALTER TABLE `workspaces` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `idx_workspaces_archived` ON `workspaces` (`archived_at`);