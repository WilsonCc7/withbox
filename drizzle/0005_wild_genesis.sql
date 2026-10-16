CREATE TABLE `favorite` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`position` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_user_media` ON `favorite` (`userId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_user_position` ON `favorite` (`userId`,`position`);--> statement-breakpoint
CREATE TABLE `media_like` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_like_user_media` ON `media_like` (`userId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE INDEX `media_like_user_created` ON `media_like` (`userId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `watch_entry` ADD `rewatch` integer DEFAULT false NOT NULL;