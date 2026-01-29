CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(256) NOT NULL,
	`documentIds` json,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`userId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`content` text NOT NULL,
	`pageNumber` int,
	`sectionTitle` varchar(512),
	`startOffset` int,
	`endOffset` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`filename` varchar(512) NOT NULL,
	`originalName` varchar(512) NOT NULL,
	`fileType` enum('pdf','docx','txt') NOT NULL,
	`documentType` enum('project_plans','specifications','standard_plans','special_provisions','cpm_schedule','other') NOT NULL DEFAULT 'other',
	`fileSize` bigint NOT NULL,
	`s3Key` varchar(1024) NOT NULL,
	`s3Url` text NOT NULL,
	`pageCount` int,
	`extractedText` text,
	`processingStatus` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`citations` json,
	`toolCalls` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`title` varchar(512) NOT NULL,
	`reportType` enum('requirements_summary','specifications_summary','critical_path','conflict_analysis','schedule_analysis','material_estimate','custom') NOT NULL,
	`content` text NOT NULL,
	`documentIds` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
