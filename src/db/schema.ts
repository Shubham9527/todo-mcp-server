// import { integer, pgTable, varchar, text, bigint } from "drizzle-orm/pg-core";

// export const todo = pgTable("todo", {
//   id: integer().primaryKey().generatedAlwaysAsIdentity(),
//   title: varchar({ length: 255 }).notNull(),
//   isCompleted: integer().notNull(),
//   email: varchar({ length: 255 }).notNull().unique(),
// });

import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const todos = pgTable(
  "Todo", // must match Neon table name exactly
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    isCompleted: boolean("isCompleted").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).$defaultFn(
      () => new Date()
    ),

    updatedAt: timestamp("updatedAt", { withTimezone: true }).$defaultFn(
      () => new Date()
    ),
  },
  (table) => [index("title_idx").on(table.title)]
);
