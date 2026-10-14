CREATE TABLE `watchlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`addedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_user_media` ON `watchlist_item` (`userId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE INDEX `watchlist_user_added` ON `watchlist_item` (`userId`,`addedAt`);