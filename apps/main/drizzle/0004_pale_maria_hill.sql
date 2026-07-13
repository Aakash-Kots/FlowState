ALTER TABLE `workspaces` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
CREATE INDEX `idx_workspaces_project` ON `workspaces` (`project_id`);