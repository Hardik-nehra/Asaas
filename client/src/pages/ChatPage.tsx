import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Streamdown } from "streamdown";
import {
  Send,
  Loader2,
  Plus,
  MessageSquare,
  FileText,
  Calculator,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  User,
  Trash2,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Citation {
  documentId: number;
  documentName: string;
  pageNumber?: number;
  section?: string;
  excerpt: string;
}

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  createdAt: Date;
}

const SUGGESTED_PROMPTS = [
  "What are the concrete strength requirements?",
  "Summarize the CPM schedule critical path.",
  "List all safety requirements in Section 01.",
  "Are there conflicting specs for the foundation?",
];

export default function ChatPage() {
  const params = useParams<{ conversationId?: string }>();
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(
    params.conversationId ? parseInt(params.conversationId) : null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations list
  const { data: conversations, refetch: refetchConversations } = trpc.conversations.list.useQuery();

  // Fetch current conversation
  const { data: currentConversation, refetch: refetchConversation } = trpc.conversations.get.useQuery(
    { id: currentConversationId! },
    { enabled: !!currentConversationId }
  );

  // Create conversation mutation
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: (data) => {
      setCurrentConversationId(data.id);
      setLocation(`/chat/${data.id}`);
      refetchConversations();
    },
  });

  // Delete conversation mutation
  const deleteConversation = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      refetchConversations();
      if (currentConversationId) {
        setCurrentConversationId(null);
        setMessages([]);
        setLocation("/chat");
      }
    },
  });

  // Send message mutation
  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: data.assistantMessage.id,
          role: "assistant",
          content: data.assistantMessage.content,
          citations: data.citations,
          toolCalls: data.toolCalls,
          createdAt: new Date(data.assistantMessage.createdAt),
        },
      ]);
      refetchConversations();
    },
    onError: (error) => {
      toast.error("Failed to send message: " + error.message);
    },
  });

  // Update messages when conversation loads
  useEffect(() => {
    if (currentConversation?.messages) {
      setMessages(
        currentConversation.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          citations: m.citations as Citation[] | undefined,
          toolCalls: m.toolCalls as ToolCall[] | undefined,
          createdAt: new Date(m.createdAt),
        }))
      );
    }
  }, [currentConversation]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Handle URL parameter changes
  useEffect(() => {
    if (params.conversationId) {
      setCurrentConversationId(parseInt(params.conversationId));
    }
  }, [params.conversationId]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || sendMessage.isPending) return;

    // Create conversation if needed
    if (!currentConversationId) {
      const conv = await createConversation.mutateAsync({
        title: trimmedInput.length > 50 ? trimmedInput.substring(0, 47) + "..." : trimmedInput,
      });
      
      // Add user message optimistically
      const tempUserMessage: Message = {
        id: Date.now(),
        role: "user",
        content: trimmedInput,
        createdAt: new Date(),
      };
      setMessages([tempUserMessage]);
      setInput("");

      // Send to new conversation
      sendMessage.mutate({
        conversationId: conv.id,
        message: trimmedInput,
      });
    } else {
      // Add user message optimistically
      const tempUserMessage: Message = {
        id: Date.now(),
        role: "user",
        content: trimmedInput,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);
      setInput("");

      // Send message
      sendMessage.mutate({
        conversationId: currentConversationId,
        message: trimmedInput,
      });
    }

    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setLocation("/chat");
  };

  const handleSelectConversation = (id: number) => {
    setCurrentConversationId(id);
    setLocation(`/chat/${id}`);
  };

  const handleDeleteConversation = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation.mutate({ id });
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const getToolIcon = (tool: string) => {
    switch (tool) {
      case "search_documents":
        return <FileText className="h-3 w-3" />;
      case "calculate_quantity":
        return <Calculator className="h-3 w-3" />;
      case "analyze_schedule":
        return <Calendar className="h-3 w-3" />;
      case "detect_conflicts":
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <Sparkles className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Conversations Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col border rounded-lg bg-card">
        <div className="p-3 border-b">
          <Button onClick={handleNewChat} className="w-full" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations?.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent transition-colors",
                  currentConversationId === conv.id && "bg-accent"
                )}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm truncate">{conv.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
            {(!conversations || conversations.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col border rounded-lg bg-card overflow-hidden">
        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div className="flex flex-col items-center gap-6 max-w-2xl">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
                  <p className="text-muted-foreground">
                    I'm your expert construction document analyzer. Upload plans, specifications, or schedules to get started.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                  {SUGGESTED_PROMPTS.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handlePromptClick(prompt)}
                      className="p-3 text-left text-sm border rounded-lg hover:bg-accent transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {messages
                .filter((m) => m.role !== "system")
                .map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-4 py-3",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {/* Tool calls indicator */}
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {message.toolCalls.map((tool, idx) => (
                            <Tooltip key={idx}>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-xs gap-1">
                                  {getToolIcon(tool.tool)}
                                  {tool.tool.replace(/_/g, " ")}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm">
                                <p className="text-xs">
                                  Input: {JSON.stringify(tool.input, null, 2).substring(0, 200)}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      )}

                      {/* Message content */}
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      )}

                      {/* Citations */}
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs font-medium mb-2 flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            Sources
                          </p>
                          <div className="space-y-1">
                            {message.citations.map((citation, idx) => (
                              <Dialog key={idx}>
                                <DialogTrigger asChild>
                                  <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left">
                                    <FileText className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{citation.documentName}</span>
                                    {citation.pageNumber && (
                                      <span className="text-muted-foreground">
                                        (p. {citation.pageNumber})
                                      </span>
                                    )}
                                    <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0" />
                                  </button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      {citation.documentName}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3">
                                    {citation.section && (
                                      <div>
                                        <p className="text-sm font-medium">Section</p>
                                        <p className="text-sm text-muted-foreground">
                                          {citation.section}
                                        </p>
                                      </div>
                                    )}
                                    {citation.pageNumber && (
                                      <div>
                                        <p className="text-sm font-medium">Page</p>
                                        <p className="text-sm text-muted-foreground">
                                          {citation.pageNumber}
                                        </p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-sm font-medium">Excerpt</p>
                                      <Card>
                                        <CardContent className="p-3">
                                          <p className="text-sm">{citation.excerpt}</p>
                                        </CardContent>
                                      </Card>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                ))}

              {/* Loading indicator */}
              {sendMessage.isPending && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2 items-end"
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your construction documents..."
              className="flex-1 max-h-32 resize-none min-h-[42px]"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sendMessage.isPending}
              className="h-[42px] w-[42px] flex-shrink-0"
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
