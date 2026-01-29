import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  documents, InsertDocument, Document,
  documentChunks, InsertDocumentChunk, DocumentChunk,
  conversations, InsertConversation, Conversation,
  messages, InsertMessage, Message,
  reports, InsertReport, Report
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER FUNCTIONS ============
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============ DOCUMENT FUNCTIONS ============
export async function createDocument(doc: InsertDocument): Promise<Document> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(documents).values(doc);
  const insertId = result[0].insertId;
  const [created] = await db.select().from(documents).where(eq(documents.id, insertId));
  return created;
}

export async function getDocumentsByUserId(userId: number): Promise<Document[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

export async function getDocumentById(id: number, userId: number): Promise<Document | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  return doc;
}

export async function updateDocumentStatus(
  id: number, 
  status: "pending" | "processing" | "completed" | "failed",
  extractedText?: string,
  pageCount?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updateData: Partial<Document> = { processingStatus: status };
  if (extractedText !== undefined) updateData.extractedText = extractedText;
  if (pageCount !== undefined) updateData.pageCount = pageCount;

  await db.update(documents).set(updateData).where(eq(documents.id, id));
}

export async function deleteDocument(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Delete associated chunks first
  await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
  
  const result = await db.delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  return result[0].affectedRows > 0;
}

// ============ DOCUMENT CHUNK FUNCTIONS ============
export async function createDocumentChunks(chunks: InsertDocumentChunk[]): Promise<void> {
  const db = await getDb();
  if (!db || chunks.length === 0) return;

  await db.insert(documentChunks).values(chunks);
}

export async function getChunksByDocumentId(documentId: number): Promise<DocumentChunk[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);
}

export async function searchChunks(userId: number, searchText: string, limit = 10): Promise<DocumentChunk[]> {
  const db = await getDb();
  if (!db) return [];

  // Simple text search - in production you'd use full-text search or vector embeddings
  return db.select().from(documentChunks)
    .where(and(
      eq(documentChunks.userId, userId),
      sql`LOWER(${documentChunks.content}) LIKE LOWER(${'%' + searchText + '%'})`
    ))
    .limit(limit);
}

export async function getChunksByUserDocuments(userId: number, documentIds?: number[]): Promise<DocumentChunk[]> {
  const db = await getDb();
  if (!db) return [];

  if (documentIds && documentIds.length > 0) {
    return db.select().from(documentChunks)
      .where(and(
        eq(documentChunks.userId, userId),
        sql`${documentChunks.documentId} IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(documentChunks.documentId, documentChunks.chunkIndex);
  }

  return db.select().from(documentChunks)
    .where(eq(documentChunks.userId, userId))
    .orderBy(documentChunks.documentId, documentChunks.chunkIndex);
}

// ============ CONVERSATION FUNCTIONS ============
export async function createConversation(conv: InsertConversation): Promise<Conversation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(conversations).values(conv);
  const insertId = result[0].insertId;
  const [created] = await db.select().from(conversations).where(eq(conversations.id, insertId));
  return created;
}

export async function getConversationsByUserId(userId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function getConversationById(id: number, userId: number): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return conv;
}

export async function updateConversation(id: number, userId: number, updates: Partial<Conversation>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(conversations)
    .set({ ...updates, lastMessageAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

export async function deleteConversation(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Delete associated messages first
  await db.delete(messages).where(eq(messages.conversationId, id));
  
  const result = await db.delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return result[0].affectedRows > 0;
}

// ============ MESSAGE FUNCTIONS ============
export async function createMessage(msg: InsertMessage): Promise<Message> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(messages).values(msg);
  const insertId = result[0].insertId;
  const [created] = await db.select().from(messages).where(eq(messages.id, insertId));
  
  // Update conversation's lastMessageAt
  await db.update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, msg.conversationId));
  
  return created;
}

export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

// ============ REPORT FUNCTIONS ============
export async function createReport(report: InsertReport): Promise<Report> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(reports).values(report);
  const insertId = result[0].insertId;
  const [created] = await db.select().from(reports).where(eq(reports.id, insertId));
  return created;
}

export async function getReportsByUserId(userId: number): Promise<Report[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(reports)
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt));
}

export async function getReportById(id: number, userId: number): Promise<Report | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [report] = await db.select().from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, userId)));
  return report;
}
