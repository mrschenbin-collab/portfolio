CREATE TABLE `project_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`object_key` text NOT NULL,
	`alt_text` text DEFAULT '作品图片' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_images_object_key` ON `project_images` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_project_images_project_order` ON `project_images` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`year` text NOT NULL,
	`category` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`concept` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`tone` text DEFAULT 'tone-ink' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_slug` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_projects_status_created` ON `projects` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
