CREATE TABLE `integrations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `encrypted_token` text NOT NULL,
  `token_iv` text NOT NULL,
  `token_expires_at` integer,
  `account_name` text,
  `external_account_id` text,
  `metadata` text,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_user_provider_idx`
ON `integrations` (`user_id`, `provider`);
