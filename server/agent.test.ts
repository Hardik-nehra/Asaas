import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    id: "test-id",
    created: Date.now(),
    model: "test-model",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: "Test response based on document content",
        tool_calls: undefined
      },
      finish_reason: "stop"
    }]
  })
}));

// Mock the db module
vi.mock("./db", () => ({
  getDocumentsByUserId: vi.fn().mockResolvedValue([]),
  searchChunks: vi.fn().mockResolvedValue([]),
  getChunksByUserDocuments: vi.fn().mockResolvedValue([])
}));

// Mock notification
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true)
}));

import { runAgent } from "./agent";
import { getDocumentsByUserId, getChunksByUserDocuments } from "./db";
import { invokeLLM } from "./_core/llm";

describe("Construction AI Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Module Exports", () => {
    it("should export runAgent function", async () => {
      const module = await import("./agent");
      expect(module.runAgent).toBeDefined();
      expect(typeof module.runAgent).toBe("function");
    });
  });

  describe("Agent Execution", () => {
    it("should return a response with content, citations, and toolCalls", async () => {
      const response = await runAgent(1, "What are the concrete requirements?", []);
      
      expect(response).toHaveProperty("content");
      expect(response).toHaveProperty("citations");
      expect(response).toHaveProperty("toolCalls");
      expect(Array.isArray(response.citations)).toBe(true);
      expect(Array.isArray(response.toolCalls)).toBe(true);
    });

    it("should handle empty message history", async () => {
      const response = await runAgent(1, "Hello", []);
      expect(response.content).toBeDefined();
    });

    it("should handle message history", async () => {
      const history = [
        { role: "user" as const, content: "What documents do I have?" },
        { role: "assistant" as const, content: "You have uploaded 3 documents." }
      ];
      
      const response = await runAgent(1, "Tell me more about them", history);
      expect(response.content).toBeDefined();
    });
  });

  describe("Proactive Document Search", () => {
    it("should search documents when user has uploaded documents with chunks", async () => {
      // Mock documents
      vi.mocked(getDocumentsByUserId).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          filename: "test.pdf",
          originalName: "Concrete Specifications.pdf",
          fileType: "pdf",
          documentType: "specifications",
          fileSize: 1000,
          s3Key: "docs/test.pdf",
          s3Url: "https://example.com/test.pdf",
          processingStatus: "completed",
          extractedText: "Concrete shall have minimum strength of 4000 psi",
          pageCount: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ]);

      // Mock chunks with matching content
      vi.mocked(getChunksByUserDocuments).mockResolvedValue([
        {
          id: 1,
          documentId: 1,
          userId: 1,
          chunkIndex: 0,
          content: "Concrete shall have minimum compressive strength of 4000 psi at 28 days. All concrete work shall conform to ACI 318.",
          pageNumber: 5,
          sectionTitle: "Section 03300 - Cast-in-Place Concrete",
          startOffset: 0,
          endOffset: 100,
          metadata: { keywords: ["concrete", "strength"], type: "specification" },
          createdAt: new Date(),
        }
      ]);

      const response = await runAgent(1, "What are the concrete requirements?");

      // Should have called getChunksByUserDocuments to search
      expect(getChunksByUserDocuments).toHaveBeenCalledWith(1);
      
      // Should have citations from the search
      expect(response.citations.length).toBeGreaterThan(0);
      expect(response.citations[0].documentName).toBe("Concrete Specifications.pdf");
      expect(response.citations[0].pageNumber).toBe(5);
      
      // Should have recorded the search as a tool call
      expect(response.toolCalls.length).toBeGreaterThan(0);
      expect(response.toolCalls[0].tool).toBe("search_documents");
    });

    it("should not include citations when no matching chunks found", async () => {
      vi.mocked(getDocumentsByUserId).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          filename: "test.pdf",
          originalName: "Steel Specifications.pdf",
          fileType: "pdf",
          documentType: "specifications",
          fileSize: 1000,
          s3Key: "docs/test.pdf",
          s3Url: "https://example.com/test.pdf",
          processingStatus: "completed",
          extractedText: "Steel requirements",
          pageCount: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ]);

      // Chunks don't match the query
      vi.mocked(getChunksByUserDocuments).mockResolvedValue([
        {
          id: 1,
          documentId: 1,
          userId: 1,
          chunkIndex: 0,
          content: "Steel reinforcement shall be Grade 60",
          pageNumber: 3,
          sectionTitle: "Steel Section",
          startOffset: 0,
          endOffset: 50,
          metadata: { keywords: ["steel"], type: "specification" },
          createdAt: new Date(),
        }
      ]);

      const response = await runAgent(1, "What are the electrical requirements?");

      // No matching chunks, so no citations from pre-search
      expect(response.citations).toHaveLength(0);
    });

    it("should handle documents still being processed", async () => {
      vi.mocked(getDocumentsByUserId).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          filename: "test.pdf",
          originalName: "Project Plans.pdf",
          fileType: "pdf",
          documentType: "project_plans",
          fileSize: 5000,
          s3Key: "docs/test.pdf",
          s3Url: "https://example.com/test.pdf",
          processingStatus: "processing",
          extractedText: null,
          pageCount: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ]);

      // No chunks yet since still processing
      vi.mocked(getChunksByUserDocuments).mockResolvedValue([]);

      const response = await runAgent(1, "What are the project requirements?");

      // Should still return a response
      expect(response.content).toBeDefined();
      // LLM should be informed about processing status
      expect(invokeLLM).toHaveBeenCalled();
    });
  });

  describe("Citation Deduplication", () => {
    it("should deduplicate citations with same document and excerpt", async () => {
      vi.mocked(getDocumentsByUserId).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          filename: "test.pdf",
          originalName: "Specs.pdf",
          fileType: "pdf",
          documentType: "specifications",
          fileSize: 1000,
          s3Key: "docs/test.pdf",
          s3Url: "https://example.com/test.pdf",
          processingStatus: "completed",
          extractedText: "Content",
          pageCount: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ]);

      // Same chunk appears multiple times (simulating overlapping search results)
      vi.mocked(getChunksByUserDocuments).mockResolvedValue([
        {
          id: 1,
          documentId: 1,
          userId: 1,
          chunkIndex: 0,
          content: "Concrete strength requirement is 4000 psi",
          pageNumber: 5,
          sectionTitle: "Concrete",
          startOffset: 0,
          endOffset: 50,
          metadata: {},
          createdAt: new Date(),
        }
      ]);

      const response = await runAgent(1, "concrete strength");

      // Citations should be deduplicated
      const uniqueCitations = new Set(response.citations.map(c => `${c.documentId}-${c.excerpt}`));
      expect(response.citations.length).toBe(uniqueCitations.size);
    });
  });
});

describe("Document Processing Module", () => {
  it("should be importable", async () => {
    const module = await import("./documentProcessor");
    expect(module).toBeDefined();
  });

  it("should export processDocumentWithLLM function", async () => {
    const { processDocumentWithLLM } = await import("./documentProcessor");
    expect(processDocumentWithLLM).toBeDefined();
    expect(typeof processDocumentWithLLM).toBe("function");
  });

  it("should export analyzeDocumentMetadata function", async () => {
    const { analyzeDocumentMetadata } = await import("./documentProcessor");
    expect(analyzeDocumentMetadata).toBeDefined();
    expect(typeof analyzeDocumentMetadata).toBe("function");
  });
});
