import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Documents table - stores metadata for uploaded construction documents
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  filename: varchar("filename", { length: 512 }).notNull(),
  originalName: varchar("originalName", { length: 512 }).notNull(),
  fileType: mysqlEnum("fileType", ["pdf", "docx", "txt"]).notNull(),
  documentType: mysqlEnum("documentType", [
    "project_plans",
    "specifications",
    "standard_plans",
    "special_provisions",
    "cpm_schedule",
    "other"
  ]).default("other").notNull(),
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  s3Key: varchar("s3Key", { length: 1024 }).notNull(),
  s3Url: text("s3Url").notNull(),
  pageCount: int("pageCount"),
  extractedText: text("extractedText"),
  processingStatus: mysqlEnum("processingStatus", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  metadata: json("metadata").$type<{
    title?: string;
    author?: string;
    sections?: string[];
    keywords?: string[];
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Document chunks - parsed text segments for semantic search / RAG
 */
export const documentChunks = mysqlTable("document_chunks", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  userId: int("userId").notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  content: text("content").notNull(),
  pageNumber: int("pageNumber"),
  sectionTitle: varchar("sectionTitle", { length: 512 }),
  startOffset: int("startOffset"),
  endOffset: int("endOffset"),
  metadata: json("metadata").$type<{
    headings?: string[];
    keywords?: string[];
    type?: string;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;

/**
 * Conversations - chat sessions for each user
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  documentIds: json("documentIds").$type<number[]>(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages - individual chat messages with citations
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  citations: json("citations").$type<{
    documentId: number;
    documentName: string;
    pageNumber?: number;
    section?: string;
    excerpt: string;
  }[]>(),
  toolCalls: json("toolCalls").$type<{
    tool: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }[]>(),
  metadata: json("metadata").$type<{
    model?: string;
    tokens?: number;
    processingTime?: number;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Reports - generated reports from document analysis
 */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId"),
  title: varchar("title", { length: 512 }).notNull(),
  reportType: mysqlEnum("reportType", [
    "requirements_summary",
    "specifications_summary",
    "critical_path",
    "conflict_analysis",
    "schedule_analysis",
    "material_estimate",
    "custom"
  ]).notNull(),
  content: text("content").notNull(),
  documentIds: json("documentIds").$type<number[]>(),
  metadata: json("metadata").$type<{
    generatedFrom?: string[];
    sections?: string[];
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;
