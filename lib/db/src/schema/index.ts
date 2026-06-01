import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const userDataTable = pgTable("user_data", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  data: text("data").notNull().default("{}"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const lotteryResultsTable = pgTable("lottery_results", {
  id: serial("id").primaryKey(),
  dateKey: text("date_key").notNull(),
  slot: text("slot").notNull(),
  number: text("number").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("lottery_results_date_slot").on(t.dateKey, t.slot)]);

export type UserData = typeof userDataTable.$inferSelect;
export type InsertUserData = typeof userDataTable.$inferInsert;
export type LotteryResult = typeof lotteryResultsTable.$inferSelect;
export type InsertLotteryResult = typeof lotteryResultsTable.$inferInsert;
