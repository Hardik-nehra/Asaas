import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import {
  createDocument,
  getDocumentsByUserId,
  getDocumentById,
  deleteDocument,
  createConversation,
  getConversationsByUserId,
  getConversationById,
  updateConversation,
  deleteConversation,
  createMessage,
  getMessagesByConversationId,
  createReport,
  getReportsByUserId,
  getReportById,
  getChunksByDocumentId,
} from "./db";
import { processDocumentWithLLM, analyzeDocumentMetadata } from "./documentProcessor";
import { runAgent, Citation, ToolCallResult } from "./agent";
import { notifyOwner } from "./_core/notification";
import { Message as LLMMessage } from "./_core/llm";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Document management
  documents: router({
    // Upload a new document
    upload: protectedProcedure
      .input(z.object({
        filename: z.string(),
        fileType: z.enum(["pdf", "docx", "txt"]),
        documentType: z.enum(["project_plans", "specifications", "standard_plans", "special_provisions", "cpm_schedule", "other"]).optional(),
        fileData: z.string(), // Base64 encoded file data
        fileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        
        // Decode base64 and upload to S3
        const buffer = Buffer.from(input.fileData, 'base64');
        const s3Key = `documents/${userId}/${nanoid()}-${input.filename}`;
        
        const contentType = input.fileType === 'pdf' ? 'application/pdf' 
          : input.fileType === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'text/plain';
        
        const { url: s3Url } = await storagePut(s3Key, buffer, contentType);
        
        // Create document record
        const document = await createDocument({
          userId,
          filename: s3Key,
          originalName: input.filename,
          fileType: input.fileType,
          documentType: input.documentType || "other",
          fileSize: input.fileSize,
          s3Key,
          s3Url,
          processingStatus: "pending",
        });

        // Process document asynchronously
        processDocumentWithLLM(
          document.id,
          userId,
          s3Url,
          input.fileType,
          input.filename
        ).then(async (processed) => {
          // Analyze and update metadata
          const metadata = await analyzeDocumentMetadata(processed.text, input.filename);
          
          // Notify owner for critical document uploads
          if (metadata.documentType === 'special_provisions' || metadata.documentType === 'cpm_schedule') {
            await notifyOwner({
              title: "Critical Document Uploaded",
              content: `User uploaded a ${metadata.documentType} document: ${input.filename}`
            });
          }
        }).catch(err => {
          console.error("Document processing failed:", err);
        });

        return document;
      }),

    // List user's documents
    list: protectedProcedure.query(async ({ ctx }) => {
      return getDocumentsByUserId(ctx.user.id);
    }),

    // Get single document
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return getDocumentById(input.id, ctx.user.id);
      }),

    // Get document chunks (for viewing parsed content)
    getChunks: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId, ctx.user.id);
        if (!doc) return [];
        return getChunksByDocumentId(input.documentId);
      }),

    // Delete document
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return deleteDocument(input.id, ctx.user.id);
      }),
  }),

  // Conversation management
  conversations: router({
    // Create new conversation
    create: protectedProcedure
      .input(z.object({
        title: z.string().optional(),
        documentIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createConversation({
          userId: ctx.user.id,
          title: input.title || "New Chat",
          documentIds: input.documentIds || [],
        });
      }),

    // List conversations
    list: protectedProcedure.query(async ({ ctx }) => {
      return getConversationsByUserId(ctx.user.id);
    }),

    // Get single conversation with messages
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const conversation = await getConversationById(input.id, ctx.user.id);
        if (!conversation) return null;
        
        const messages = await getMessagesByConversationId(input.id);
        return { ...conversation, messages };
      }),

    // Update conversation
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        documentIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updates: Record<string, unknown> = {};
        if (input.title) updates.title = input.title;
        if (input.documentIds) updates.documentIds = input.documentIds;
        
        await updateConversation(input.id, ctx.user.id, updates);
        return getConversationById(input.id, ctx.user.id);
      }),

    // Delete conversation
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return deleteConversation(input.id, ctx.user.id);
      }),
  }),

  // Chat / AI Agent
  chat: router({
    // Send message and get AI response
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        
        // Verify conversation belongs to user
        const conversation = await getConversationById(input.conversationId, userId);
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        // Save user message
        const userMessage = await createMessage({
          conversationId: input.conversationId,
          userId,
          role: "user",
          content: input.message,
        });

        // Get conversation history for context
        const history = await getMessagesByConversationId(input.conversationId);
        const llmHistory: LLMMessage[] = history
          .filter(m => m.id !== userMessage.id)
          .slice(-10) // Last 10 messages for context
          .map(m => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          }));

        // Run AI agent
        const agentResponse = await runAgent(userId, input.message, llmHistory);

        // Save assistant message
        const assistantMessage = await createMessage({
          conversationId: input.conversationId,
          userId,
          role: "assistant",
          content: agentResponse.content,
          citations: agentResponse.citations,
          toolCalls: agentResponse.toolCalls,
        });

        // Update conversation title if it's the first message
        if (history.length === 0) {
          const title = input.message.length > 50 
            ? input.message.substring(0, 47) + "..." 
            : input.message;
          await updateConversation(input.conversationId, userId, { title });
        }

        return {
          userMessage,
          assistantMessage,
          citations: agentResponse.citations,
          toolCalls: agentResponse.toolCalls,
        };
      }),

    // Quick question without conversation (creates temp conversation)
    quickAsk: protectedProcedure
      .input(z.object({
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        
        // Create temporary conversation
        const conversation = await createConversation({
          userId,
          title: input.message.length > 50 ? input.message.substring(0, 47) + "..." : input.message,
        });

        // Save user message
        await createMessage({
          conversationId: conversation.id,
          userId,
          role: "user",
          content: input.message,
        });

        // Run AI agent
        const agentResponse = await runAgent(userId, input.message, []);

        // Save assistant message
        const assistantMessage = await createMessage({
          conversationId: conversation.id,
          userId,
          role: "assistant",
          content: agentResponse.content,
          citations: agentResponse.citations,
          toolCalls: agentResponse.toolCalls,
        });

        return {
          conversationId: conversation.id,
          response: agentResponse.content,
          citations: agentResponse.citations,
          toolCalls: agentResponse.toolCalls,
        };
      }),
  }),

  // Reports
  reports: router({
    // Generate a new report
    generate: protectedProcedure
      .input(z.object({
        reportType: z.enum([
          "requirements_summary",
          "specifications_summary", 
          "critical_path",
          "conflict_analysis",
          "schedule_analysis",
          "material_estimate",
          "custom"
        ]),
        title: z.string().optional(),
        documentIds: z.array(z.number()).optional(),
        conversationId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        
        // Generate report content using AI agent
        const prompt = `Generate a detailed ${input.reportType.replace(/_/g, ' ')} report based on the uploaded documents.`;
        const agentResponse = await runAgent(userId, prompt, []);

        const report = await createReport({
          userId,
          conversationId: input.conversationId,
          title: input.title || `${input.reportType.replace(/_/g, ' ').toUpperCase()} Report`,
          reportType: input.reportType,
          content: agentResponse.content,
          documentIds: input.documentIds || [],
          metadata: {
            generatedFrom: agentResponse.citations.map(c => c.documentName),
          },
        });

        return report;
      }),

    // List reports
    list: protectedProcedure.query(async ({ ctx }) => {
      return getReportsByUserId(ctx.user.id);
    }),

    // Get single report
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return getReportById(input.id, ctx.user.id);
      }),
  }),

  // Calculations (standalone)
  calculations: router({
    perform: protectedProcedure
      .input(z.object({
        calculationType: z.enum(["area", "volume", "linear", "weight", "conversion", "custom"]),
        values: z.record(z.string(), z.number()),
        formula: z.string().optional(),
        unitFrom: z.string().optional(),
        unitTo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Use the agent's calculation capability
        const prompt = `Perform a ${input.calculationType} calculation with values: ${JSON.stringify(input.values)}${input.formula ? ` using formula: ${input.formula}` : ''}${input.unitFrom && input.unitTo ? ` converting from ${input.unitFrom} to ${input.unitTo}` : ''}`;
        
        const response = await runAgent(ctx.user.id, prompt, []);
        return {
          result: response.content,
          toolCalls: response.toolCalls,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
