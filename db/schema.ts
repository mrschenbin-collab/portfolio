import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable(
  "projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    year: text("year").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull().default(""),
    context: text("context").notNull().default(""),
    concept: text("concept").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    tone: text("tone").notNull().default("tone-ink"),
    status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_projects_slug").on(table.slug),
    index("idx_projects_status_created").on(table.status, table.createdAt),
  ],
);

export const projectImages = sqliteTable(
  "project_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    altText: text("alt_text").notNull().default("作品图片"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_project_images_object_key").on(table.objectKey),
    index("idx_project_images_project_order").on(table.projectId, table.sortOrder),
  ],
);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
