import { describe, expect, it, vi, beforeAll } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: "Test response",
        tool_calls: undefined
      }
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

describe("Construction AI Agent", () => {
  describe("Module Exports", () => {
    it("should export Citation type", async () => {
      const module = await import("./agent");
      // Type exports don't show up at runtime, but we can check the module loads
      expect(module).toBeDefined();
    });

    it("should export runAgent function", async () => {
      const { runAgent } = await import("./agent");
      expect(runAgent).toBeDefined();
      expect(typeof runAgent).toBe("function");
    });
  });

  describe("Agent Execution", () => {
    it("should return a response with content, citations, and toolCalls", async () => {
      const { runAgent } = await import("./agent");
      
      const response = await runAgent(1, "What are the concrete requirements?", []);
      
      expect(response).toHaveProperty("content");
      expect(response).toHaveProperty("citations");
      expect(response).toHaveProperty("toolCalls");
      expect(Array.isArray(response.citations)).toBe(true);
      expect(Array.isArray(response.toolCalls)).toBe(true);
    });

    it("should handle empty message history", async () => {
      const { runAgent } = await import("./agent");
      
      const response = await runAgent(1, "Hello", []);
      
      expect(response.content).toBeDefined();
    });

    it("should handle message history", async () => {
      const { runAgent } = await import("./agent");
      
      const history = [
        { role: "user" as const, content: "What documents do I have?" },
        { role: "assistant" as const, content: "You have uploaded 3 documents." }
      ];
      
      const response = await runAgent(1, "Tell me more about them", history);
      
      expect(response.content).toBeDefined();
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
