CREATE TABLE `rating` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`value` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rating_user_media` ON `rating` (`userId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`body` text NOT NULL,
	`containsSpoilers` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_user_media` ON `review` (`userId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE TABLE `watch_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`season` integer,
	`episode` integer,
	`watchedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_entry_user_media` ON `watch_entry` (`userId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE INDEX `watch_entry_user_episode` ON `watch_entry` (`userId`,`kind`,`tmdbId`,`season`,`episode`);--> statement-breakpoint
CREATE INDEX `watch_entry_user_watched_at` ON `watch_entry` (`userId`,`watchedAt`);