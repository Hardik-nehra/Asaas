import { invokeLLM } from "./_core/llm";
import { createDocumentChunks, updateDocumentStatus } from "./db";
import { InsertDocumentChunk } from "../drizzle/schema";

// Chunk size for document splitting (characters)
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

interface ProcessedDocument {
  text: string;
  pageCount?: number;
  sections: Array<{
    title: string;
    content: string;
    pageNumber?: number;
  }>;
}

// Split text into overlapping chunks for better context
function splitIntoChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    // Try to break at sentence or paragraph boundaries
    if (end < text.length) {
      const breakPoints = ['\n\n', '.\n', '. ', '\n'];
      for (const bp of breakPoints) {
        const lastBreak = text.lastIndexOf(bp, end);
        if (lastBreak > start + chunkSize / 2) {
          end = lastBreak + bp.length;
          break;
        }
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  
  return chunks.filter(c => c.length > 50); // Filter out tiny chunks
}

// Extract section titles from text
function extractSections(text: string): Array<{ title: string; content: string; startIndex: number }> {
  const sections: Array<{ title: string; content: string; startIndex: number }> = [];
  
  // Common construction document section patterns
  const sectionPatterns = [
    /^(?:SECTION|Section)\s+(\d+(?:\.\d+)*)\s*[-–—]?\s*(.+?)$/gm,
    /^(?:PART|Part)\s+(\d+(?:\.\d+)*)\s*[-–—]?\s*(.+?)$/gm,
    /^(\d+(?:\.\d+)+)\s+([A-Z][A-Za-z\s]+)$/gm,
    /^(?:ARTICLE|Article)\s+(\d+)\s*[-–—]?\s*(.+?)$/gm,
    /^(?:DIVISION|Division)\s+(\d+)\s*[-–—]?\s*(.+?)$/gm,
  ];
  
  for (const pattern of sectionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      sections.push({
        title: `${match[1]} ${match[2]}`.trim(),
        content: '',
        startIndex: match.index
      });
    }
  }
  
  // Sort by position and extract content
  sections.sort((a, b) => a.startIndex - b.startIndex);
  
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startIndex;
    const end = i < sections.length - 1 ? sections[i + 1].startIndex : text.length;
    sections[i].content = text.slice(start, end).trim();
  }
  
  return sections;
}

// Estimate page number based on character position (rough estimate)
function estimatePageNumber(charPosition: number, totalChars: number, totalPages: number): number {
  if (!totalPages) return 1;
  const charsPerPage = totalChars / totalPages;
  return Math.ceil(charPosition / charsPerPage);
}

// Process document using LLM for PDF content extraction
export async function processDocumentWithLLM(
  documentId: number,
  userId: number,
  fileUrl: string,
  fileType: string,
  originalName: string
): Promise<ProcessedDocument> {
  try {
    await updateDocumentStatus(documentId, "processing");

    let extractedText = '';
    let pageCount: number | undefined;

    if (fileType === 'pdf') {
      // Use LLM with file_url for PDF extraction
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a document text extraction assistant. Extract ALL text content from the provided PDF document. 
Preserve the document structure including:
- Section headers and numbers
- Paragraph breaks
- Lists and bullet points
- Tables (convert to readable text format)
- Page breaks (indicate with [PAGE BREAK])

Output the complete extracted text without any commentary or summarization.`
          },
          {
            role: "user",
            content: [
              {
                type: "file_url",
                file_url: {
                  url: fileUrl,
                  mime_type: "application/pdf"
                }
              },
              {
                type: "text",
                text: "Extract all text content from this PDF document. Preserve structure and formatting."
              }
            ]
          }
        ]
      });

      extractedText = typeof response.choices[0]?.message?.content === 'string'
        ? response.choices[0].message.content
        : JSON.stringify(response.choices[0]?.message?.content);

      // Estimate page count from page breaks
      const pageBreaks = (extractedText.match(/\[PAGE BREAK\]/g) || []).length;
      pageCount = pageBreaks + 1;

    } else if (fileType === 'txt') {
      // For text files, fetch directly
      const response = await fetch(fileUrl);
      extractedText = await response.text();
      pageCount = Math.ceil(extractedText.length / 3000); // Rough estimate

    } else if (fileType === 'docx') {
      // Use LLM for DOCX extraction as well
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "Extract all text content from the provided document. Preserve structure and formatting."
          },
          {
            role: "user",
            content: [
              {
                type: "file_url",
                file_url: {
                  url: fileUrl,
                  mime_type: "application/pdf" // DOCX might need different handling
                }
              },
              {
                type: "text",
                text: "Extract all text content from this document."
              }
            ]
          }
        ]
      });

      extractedText = typeof response.choices[0]?.message?.content === 'string'
        ? response.choices[0].message.content
        : JSON.stringify(response.choices[0]?.message?.content);
    }

    // Extract sections from the text
    const sections = extractSections(extractedText);

    // Create document chunks for RAG
    const textChunks = splitIntoChunks(extractedText);
    const chunkRecords: InsertDocumentChunk[] = textChunks.map((content, index) => {
      // Find which section this chunk belongs to
      const chunkStart = extractedText.indexOf(content);
      const section = sections.find(s => 
        chunkStart >= s.startIndex && 
        chunkStart < s.startIndex + s.content.length
      );

      return {
        documentId,
        userId,
        chunkIndex: index,
        content,
        pageNumber: pageCount ? estimatePageNumber(chunkStart, extractedText.length, pageCount) : null,
        sectionTitle: section?.title || null,
        startOffset: chunkStart,
        endOffset: chunkStart + content.length,
        metadata: {
          keywords: extractKeywords(content),
          type: detectChunkType(content)
        }
      };
    });

    await createDocumentChunks(chunkRecords);
    await updateDocumentStatus(documentId, "completed", extractedText, pageCount);

    return {
      text: extractedText,
      pageCount,
      sections: sections.map(s => ({
        title: s.title,
        content: s.content,
        pageNumber: pageCount ? estimatePageNumber(s.startIndex, extractedText.length, pageCount) : undefined
      }))
    };

  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);
    await updateDocumentStatus(documentId, "failed");
    throw error;
  }
}

// Extract keywords from text chunk
function extractKeywords(text: string): string[] {
  // Construction-specific keywords
  const constructionTerms = [
    'concrete', 'steel', 'rebar', 'reinforcement', 'aggregate', 'cement',
    'foundation', 'footing', 'slab', 'beam', 'column', 'wall',
    'specification', 'requirement', 'standard', 'code', 'regulation',
    'schedule', 'milestone', 'deadline', 'duration', 'critical path',
    'material', 'equipment', 'labor', 'cost', 'quantity',
    'inspection', 'testing', 'quality', 'safety', 'compliance',
    'drainage', 'grading', 'excavation', 'backfill', 'compaction',
    'asphalt', 'pavement', 'curb', 'gutter', 'sidewalk',
    'electrical', 'plumbing', 'mechanical', 'HVAC', 'fire protection',
    'psi', 'ksi', 'mpa', 'strength', 'load', 'capacity'
  ];

  const lowerText = text.toLowerCase();
  return constructionTerms.filter(term => lowerText.includes(term));
}

// Detect the type of content in a chunk
function detectChunkType(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (/schedule|milestone|duration|start date|end date|critical path/i.test(text)) {
    return 'schedule';
  }
  if (/specification|requirement|shall|must|minimum|maximum/i.test(text)) {
    return 'specification';
  }
  if (/\d+\s*(psi|ksi|mpa|lbs?|kg|tons?|cf|cy|sf|sy|lf)/i.test(text)) {
    return 'measurement';
  }
  if (/section\s+\d|article\s+\d|part\s+\d/i.test(text)) {
    return 'section_header';
  }
  if (/table|figure|drawing|plan|detail/i.test(text)) {
    return 'reference';
  }
  
  return 'general';
}

// Analyze document for construction-specific metadata
export async function analyzeDocumentMetadata(
  extractedText: string,
  originalName: string
): Promise<{
  title?: string;
  documentType: string;
  keywords: string[];
  sections: string[];
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Analyze this construction document and extract metadata. Return JSON with:
- title: Document title if found
- documentType: One of: project_plans, specifications, standard_plans, special_provisions, cpm_schedule, other
- keywords: Array of relevant construction keywords
- sections: Array of main section titles found`
      },
      {
        role: "user",
        content: `Filename: ${originalName}\n\nDocument content (first 5000 chars):\n${extractedText.substring(0, 5000)}`
      }
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "document_metadata",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            documentType: { 
              type: "string",
              enum: ["project_plans", "specifications", "standard_plans", "special_provisions", "cpm_schedule", "other"]
            },
            keywords: { type: "array", items: { type: "string" } },
            sections: { type: "array", items: { type: "string" } }
          },
          required: ["documentType", "keywords", "sections"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content === 'string') {
    return JSON.parse(content);
  }
  
  return {
    documentType: 'other',
    keywords: [],
    sections: []
  };
}
