ALTER TABLE `tabs` ADD `permission_mode` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `tabs` DROP COLUMN `plan_mode`;