import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenExpiresAt: integer("token_expires_at"),
  accountName: text("account_name"),
  externalAccountId: text("external_account_id"),
  metadata: text("metadata"),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
