CREATE TABLE `ledger_records` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`local_date` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `records_user_date` ON `ledger_records` (`user_id`,`local_date`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `ledger_revisions` (
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `record_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `mutation_receipts` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`operation_hash` text NOT NULL,
	`record_id` text,
	`revision` integer NOT NULL,
	`saved_at` text NOT NULL,
	`payload` text,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `request_id`)
);
--> statement-breakpoint
CREATE INDEX `receipts_record` ON `mutation_receipts` (`user_id`,`record_id`);--> statement-breakpoint
CREATE TABLE `settings_versions` (
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`effective_from` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload` text NOT NULL,
	`request_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `settings_effective` ON `settings_versions` (`user_id`,`effective_from`,`revision`);