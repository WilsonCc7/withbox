CREATE TABLE `playback_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`tmdbId` integer NOT NULL,
	`season` integer,
	`episode` integer,
	`slotKey` text NOT NULL,
	`positionSeconds` integer NOT NULL,
	`durationSeconds` integer,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playback_progress_slot` ON `playback_progress` (`userId`,`slotKey`);--> statement-breakpoint
CREATE INDEX `playback_progress_user_index` ON `playback_progress` (`userId`);