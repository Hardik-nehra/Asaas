import { invokeLLM, Tool, Message } from "./_core/llm";
import { getChunksByUserDocuments, getDocumentsByUserId } from "./db";
import { notifyOwner } from "./_core/notification";

// Types for agent responses
export interface Citation {
  documentId: number;
  documentName: string;
  pageNumber?: number;
  section?: string;
  excerpt: string;
}

export interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface AgentResponse {
  content: string;
  citations: Citation[];
  toolCalls: ToolCallResult[];
}

// Construction-specific tools
const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "search_documents",
      description: "Search through uploaded construction documents to find relevant information. Use this to find specifications, requirements, measurements, or any document content.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant document sections"
          },
          document_types: {
            type: "array",
            items: { type: "string" },
            description: "Optional filter by document types: project_plans, specifications, standard_plans, special_provisions, cpm_schedule, other"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_quantity",
      description: "Perform construction quantity calculations including area, volume, material quantities, and unit conversions.",
      parameters: {
        type: "object",
        properties: {
          calculation_type: {
            type: "string",
            enum: ["area", "volume", "linear", "weight", "conversion", "custom"],
            description: "Type of calculation to perform"
          },
          values: {
            type: "object",
            description: "Input values for the calculation (e.g., length, width, height, quantity, unit)"
          },
          formula: {
            type: "string",
            description: "Optional custom formula for complex calculations"
          },
          unit_from: {
            type: "string",
            description: "Source unit for conversions"
          },
          unit_to: {
            type: "string",
            description: "Target unit for conversions"
          }
        },
        required: ["calculation_type", "values"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_schedule",
      description: "Analyze CPM schedules to extract timelines, milestones, critical path items, and dependencies from uploaded schedule documents.",
      parameters: {
        type: "object",
        properties: {
          analysis_type: {
            type: "string",
            enum: ["critical_path", "milestones", "dependencies", "timeline", "delays", "summary"],
            description: "Type of schedule analysis to perform"
          },
          date_range: {
            type: "object",
            properties: {
              start: { type: "string", description: "Start date (YYYY-MM-DD)" },
              end: { type: "string", description: "End date (YYYY-MM-DD)" }
            },
            description: "Optional date range filter"
          }
        },
        required: ["analysis_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate comprehensive reports from document analysis including requirements summaries, specification summaries, conflict analysis, and material estimates.",
      parameters: {
        type: "object",
        properties: {
          report_type: {
            type: "string",
            enum: ["requirements_summary", "specifications_summary", "critical_path", "conflict_analysis", "schedule_analysis", "material_estimate", "custom"],
            description: "Type of report to generate"
          },
          sections: {
            type: "array",
            items: { type: "string" },
            description: "Specific sections or topics to include in the report"
          },
          document_ids: {
            type: "array",
            items: { type: "number" },
            description: "Optional specific document IDs to include"
          }
        },
        required: ["report_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "detect_conflicts",
      description: "Analyze multiple documents to identify conflicting specifications, requirements, or standards across different document types.",
      parameters: {
        type: "object",
        properties: {
          topics: {
            type: "array",
            items: { type: "string" },
            description: "Specific topics to check for conflicts (e.g., 'concrete strength', 'rebar spacing')"
          },
          document_ids: {
            type: "array",
            items: { type: "number" },
            description: "Optional specific document IDs to compare"
          }
        },
        required: ["topics"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "extract_specifications",
      description: "Extract specific technical specifications, standards, or requirements from documents.",
      parameters: {
        type: "object",
        properties: {
          spec_type: {
            type: "string",
            description: "Type of specification to extract (e.g., 'concrete', 'steel', 'electrical', 'plumbing')"
          },
          attributes: {
            type: "array",
            items: { type: "string" },
            description: "Specific attributes to extract (e.g., 'strength', 'grade', 'dimensions')"
          }
        },
        required: ["spec_type"]
      }
    }
  }
];

// Unit conversion factors
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  length: {
    "ft_to_m": 0.3048,
    "m_to_ft": 3.28084,
    "in_to_cm": 2.54,
    "cm_to_in": 0.393701,
    "yd_to_m": 0.9144,
    "m_to_yd": 1.09361,
  },
  area: {
    "sqft_to_sqm": 0.092903,
    "sqm_to_sqft": 10.7639,
    "sqyd_to_sqm": 0.836127,
    "sqm_to_sqyd": 1.19599,
    "acre_to_sqm": 4046.86,
    "sqm_to_acre": 0.000247105,
  },
  volume: {
    "cuft_to_cum": 0.0283168,
    "cum_to_cuft": 35.3147,
    "cuyd_to_cum": 0.764555,
    "cum_to_cuyd": 1.30795,
    "gal_to_l": 3.78541,
    "l_to_gal": 0.264172,
  },
  weight: {
    "lb_to_kg": 0.453592,
    "kg_to_lb": 2.20462,
    "ton_to_kg": 907.185,
    "kg_to_ton": 0.00110231,
    "tonne_to_kg": 1000,
    "kg_to_tonne": 0.001,
  }
};

// Execute calculation tool
function executeCalculation(input: Record<string, unknown>): Record<string, unknown> {
  const { calculation_type, values, formula, unit_from, unit_to } = input as {
    calculation_type: string;
    values: Record<string, number>;
    formula?: string;
    unit_from?: string;
    unit_to?: string;
  };

  let result: number;
  let explanation: string;

  switch (calculation_type) {
    case "area":
      if (values.length && values.width) {
        result = values.length * values.width;
        explanation = `Area = ${values.length} × ${values.width} = ${result} square units`;
      } else if (values.radius) {
        result = Math.PI * values.radius * values.radius;
        explanation = `Area = π × ${values.radius}² = ${result.toFixed(4)} square units`;
      } else {
        return { error: "Missing required values for area calculation (length/width or radius)" };
      }
      break;

    case "volume":
      if (values.length && values.width && values.height) {
        result = values.length * values.width * values.height;
        explanation = `Volume = ${values.length} × ${values.width} × ${values.height} = ${result} cubic units`;
      } else if (values.area && values.depth) {
        result = values.area * values.depth;
        explanation = `Volume = ${values.area} × ${values.depth} = ${result} cubic units`;
      } else {
        return { error: "Missing required values for volume calculation" };
      }
      break;

    case "linear":
      if (values.quantity && values.unit_length) {
        result = values.quantity * values.unit_length;
        explanation = `Total length = ${values.quantity} × ${values.unit_length} = ${result} linear units`;
      } else {
        return { error: "Missing required values for linear calculation" };
      }
      break;

    case "weight":
      if (values.volume && values.density) {
        result = values.volume * values.density;
        explanation = `Weight = ${values.volume} × ${values.density} = ${result} weight units`;
      } else if (values.quantity && values.unit_weight) {
        result = values.quantity * values.unit_weight;
        explanation = `Total weight = ${values.quantity} × ${values.unit_weight} = ${result} weight units`;
      } else {
        return { error: "Missing required values for weight calculation" };
      }
      break;

    case "conversion":
      if (unit_from && unit_to && values.value !== undefined) {
        const conversionKey = `${unit_from}_to_${unit_to}`;
        let factor: number | undefined;
        
        for (const category of Object.values(UNIT_CONVERSIONS)) {
          if (category[conversionKey]) {
            factor = category[conversionKey];
            break;
          }
        }
        
        if (factor) {
          result = values.value * factor;
          explanation = `${values.value} ${unit_from} = ${result.toFixed(4)} ${unit_to}`;
        } else {
          return { error: `Conversion from ${unit_from} to ${unit_to} not supported` };
        }
      } else {
        return { error: "Missing required values for conversion (value, unit_from, unit_to)" };
      }
      break;

    case "custom":
      if (formula) {
        try {
          // Simple formula evaluation (in production, use a proper math parser)
          let evalFormula = formula;
          for (const [key, val] of Object.entries(values)) {
            evalFormula = evalFormula.replace(new RegExp(key, 'g'), String(val));
          }
          result = Function(`"use strict"; return (${evalFormula})`)();
          explanation = `Custom calculation: ${formula} = ${result}`;
        } catch {
          return { error: "Invalid formula or values" };
        }
      } else {
        return { error: "Custom calculation requires a formula" };
      }
      break;

    default:
      return { error: `Unknown calculation type: ${calculation_type}` };
  }

  return {
    result,
    explanation,
    calculation_type,
    input_values: values
  };
}

// Search documents and return relevant chunks with citations
async function searchDocuments(
  userId: number,
  query: string,
  documentTypes?: string[]
): Promise<{ chunks: Array<{ content: string; citation: Citation }>; }> {
  const documents = await getDocumentsByUserId(userId);
  const chunks = await getChunksByUserDocuments(userId);
  
  // Filter by document types if specified
  let relevantDocs = documents;
  if (documentTypes && documentTypes.length > 0) {
    relevantDocs = documents.filter(d => documentTypes.includes(d.documentType));
  }
  const relevantDocIds = new Set(relevantDocs.map(d => d.id));
  
  // Simple keyword matching (in production, use embeddings/vector search)
  const queryTerms = query.toLowerCase().split(/\s+/);
  const matchingChunks = chunks
    .filter(chunk => {
      if (!relevantDocIds.has(chunk.documentId)) return false;
      const content = chunk.content.toLowerCase();
      return queryTerms.some(term => content.includes(term));
    })
    .slice(0, 10); // Limit results
  
  return {
    chunks: matchingChunks.map(chunk => {
      const doc = documents.find(d => d.id === chunk.documentId);
      return {
        content: chunk.content,
        citation: {
          documentId: chunk.documentId,
          documentName: doc?.originalName || "Unknown Document",
          pageNumber: chunk.pageNumber ?? undefined,
          section: chunk.sectionTitle ?? undefined,
          excerpt: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? "..." : "")
        }
      };
    })
  };
}

// Main agent function
export async function runAgent(
  userId: number,
  userMessage: string,
  conversationHistory: Message[] = []
): Promise<AgentResponse> {
  const citations: Citation[] = [];
  const toolCalls: ToolCallResult[] = [];
  
  // Get user's documents for context
  const userDocuments = await getDocumentsByUserId(userId);
  const documentContext = userDocuments.length > 0
    ? `\n\nAvailable documents:\n${userDocuments.map(d => `- ${d.originalName} (${d.documentType}, ${d.pageCount || 'unknown'} pages)`).join('\n')}`
    : "\n\nNo documents have been uploaded yet.";

  const systemPrompt = `You are an expert construction document AI assistant. You help construction professionals analyze project documents, perform calculations, generate reports, and identify specification conflicts.

Your capabilities include:
1. **Document Search**: Search through uploaded construction documents (project plans, specifications, standard plans, special provisions, CPM schedules)
2. **Calculations**: Perform quantity calculations (area, volume, linear measurements, weight, unit conversions)
3. **Schedule Analysis**: Analyze CPM schedules for critical path, milestones, dependencies, and timelines
4. **Report Generation**: Create comprehensive reports summarizing requirements, specifications, and conflicts
5. **Conflict Detection**: Identify conflicting specifications across different document types
6. **Specification Extraction**: Extract specific technical specifications and standards

IMPORTANT GUIDELINES:
- Always cite your sources with document name, page number, and section when referencing document content
- When performing calculations, show your work and explain the formula used
- When detecting conflicts, clearly identify which documents contain conflicting information
- Use construction industry terminology appropriately
- If information is not found in the documents, clearly state that
- For scheduling questions, reference specific activities, dates, and dependencies
${documentContext}`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage }
  ];

  // First LLM call to determine tool usage
  const initialResponse = await invokeLLM({
    messages,
    tools: AGENT_TOOLS,
    toolChoice: "auto"
  });

  const assistantMessage = initialResponse.choices[0]?.message;
  
  if (!assistantMessage) {
    return {
      content: "I apologize, but I encountered an error processing your request. Please try again.",
      citations: [],
      toolCalls: []
    };
  }

  // Handle tool calls if present
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolResults: Message[] = [];
    
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolInput = JSON.parse(toolCall.function.arguments);
      let toolOutput: Record<string, unknown>;

      switch (toolName) {
        case "search_documents": {
          const searchResult = await searchDocuments(userId, toolInput.query, toolInput.document_types);
          toolOutput = {
            found: searchResult.chunks.length,
            results: searchResult.chunks.map(c => ({
              content: c.content,
              source: c.citation
            }))
          };
          // Add citations from search results
          searchResult.chunks.forEach(c => citations.push(c.citation));
          break;
        }

        case "calculate_quantity": {
          toolOutput = executeCalculation(toolInput);
          break;
        }

        case "analyze_schedule": {
          // Search for schedule-related content
          const scheduleSearch = await searchDocuments(userId, `schedule ${toolInput.analysis_type} timeline milestone`, ["cpm_schedule"]);
          toolOutput = {
            analysis_type: toolInput.analysis_type,
            found_items: scheduleSearch.chunks.length,
            schedule_data: scheduleSearch.chunks.map(c => ({
              content: c.content,
              source: c.citation
            }))
          };
          scheduleSearch.chunks.forEach(c => citations.push(c.citation));
          break;
        }

        case "generate_report": {
          // Gather relevant content for report
          const reportSearch = await searchDocuments(userId, toolInput.report_type.replace(/_/g, ' '));
          toolOutput = {
            report_type: toolInput.report_type,
            sections_found: reportSearch.chunks.length,
            content_sources: reportSearch.chunks.map(c => ({
              content: c.content,
              source: c.citation
            }))
          };
          reportSearch.chunks.forEach(c => citations.push(c.citation));
          break;
        }

        case "detect_conflicts": {
          const topics = toolInput.topics as string[];
          const conflictResults: Array<{ topic: string; sources: Array<{ content: string; citation: Citation }> }> = [];
          
          for (const topic of topics) {
            const topicSearch = await searchDocuments(userId, topic);
            conflictResults.push({
              topic,
              sources: topicSearch.chunks
            });
            topicSearch.chunks.forEach(c => citations.push(c.citation));
          }
          
          toolOutput = {
            topics_analyzed: topics,
            potential_conflicts: conflictResults
          };

          // Notify owner if conflicts are detected
          if (conflictResults.some(r => r.sources.length > 1)) {
            await notifyOwner({
              title: "Specification Conflict Detected",
              content: `A user has identified potential specification conflicts in topics: ${topics.join(', ')}`
            });
          }
          break;
        }

        case "extract_specifications": {
          const specSearch = await searchDocuments(userId, `${toolInput.spec_type} specification ${(toolInput.attributes || []).join(' ')}`);
          toolOutput = {
            spec_type: toolInput.spec_type,
            specifications_found: specSearch.chunks.length,
            data: specSearch.chunks.map(c => ({
              content: c.content,
              source: c.citation
            }))
          };
          specSearch.chunks.forEach(c => citations.push(c.citation));
          break;
        }

        default:
          toolOutput = { error: `Unknown tool: ${toolName}` };
      }

      toolCalls.push({
        tool: toolName,
        input: toolInput,
        output: toolOutput
      });

      toolResults.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolOutput)
      });
    }

    // Second LLM call with tool results
    const assistantToolMessage: Message = {
      role: "assistant",
      content: typeof assistantMessage.content === 'string' ? assistantMessage.content : JSON.stringify(assistantMessage.content)
    };
    
    const finalResponse = await invokeLLM({
      messages: [
        ...messages,
        assistantToolMessage,
        ...toolResults
      ]
    });

    const finalContent = finalResponse.choices[0]?.message?.content;
    
    // Dedupe citations
    const citationMap = new Map<string, Citation>();
    citations.forEach(c => citationMap.set(c.documentId + c.excerpt, c));
    
    return {
      content: typeof finalContent === 'string' ? finalContent : JSON.stringify(finalContent),
      citations: Array.from(citationMap.values()),
      toolCalls
    };
  }

  // No tool calls, return direct response
  return {
    content: typeof assistantMessage.content === 'string' 
      ? assistantMessage.content 
      : JSON.stringify(assistantMessage.content),
    citations,
    toolCalls
  };
}

// Streaming agent for real-time responses
export async function* runAgentStream(
  userId: number,
  userMessage: string,
  conversationHistory: Message[] = []
): AsyncGenerator<{ type: 'content' | 'citation' | 'tool' | 'done'; data: unknown }> {
  // For now, use non-streaming and yield chunks
  // In production, implement proper SSE streaming
  const response = await runAgent(userId, userMessage, conversationHistory);
  
  // Yield tool calls first
  for (const tool of response.toolCalls) {
    yield { type: 'tool', data: tool };
  }
  
  // Yield content in chunks for streaming effect
  const words = response.content.split(' ');
  let accumulated = '';
  for (let i = 0; i < words.length; i += 3) {
    accumulated += words.slice(i, i + 3).join(' ') + ' ';
    yield { type: 'content', data: accumulated.trim() };
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate streaming delay
  }
  
  // Yield citations
  for (const citation of response.citations) {
    yield { type: 'citation', data: citation };
  }
  
  yield { type: 'done', data: response };
}
