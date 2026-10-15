CREATE TABLE `follow` (
	`id` text PRIMARY KEY NOT NULL,
	`followerId` text NOT NULL,
	`followingId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`followerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followingId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follow_pair` ON `follow` (`followerId`,`followingId`);--> statement-breakpoint
CREATE INDEX `follow_following_index` ON `follow` (`followingId`);--> statement-breakpoint
CREATE TABLE `list` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `list_user_index` ON `list` (`userId`);--> statement-breakpoint
CREATE TABLE `list_item` (
	`id` text PRIMARY KEY NOT NULL,
	`listId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`position` integer NOT NULL,
	`addedAt` integer NOT NULL,
	FOREIGN KEY (`listId`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_item_media` ON `list_item` (`listId`,`kind`,`tmdbId`);--> statement-breakpoint
CREATE INDEX `list_item_list_index` ON `list_item` (`listId`);