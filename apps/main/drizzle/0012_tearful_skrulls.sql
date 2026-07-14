ALTER TABLE `tabs` ADD `kind` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `tabs` ADD `file_path` text;