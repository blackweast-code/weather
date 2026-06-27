import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locationSettings = sqliteTable("location_settings", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  updatedAt: text("updated_at").notNull(),
});
