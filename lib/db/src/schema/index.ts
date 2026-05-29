import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const userDataTable = pgTable("user_data", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  data: text("data").notNull().default("{}"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserData = typeof userDataTable.$inferSelect;
export type InsertUserData = typeof userDataTable.$inferInsert;
