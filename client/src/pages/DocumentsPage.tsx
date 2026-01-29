import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  File,
  FileType,
  Calendar,
  HardDrive,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DocumentType = "project_plans" | "specifications" | "standard_plans" | "special_provisions" | "cpm_schedule" | "other";

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  project_plans: "Project Plans",
  specifications: "Specifications",
  standard_plans: "Standard Plans",
  special_provisions: "Special Provisions",
  cpm_schedule: "CPM Schedule",
  other: "Other",
};

const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  project_plans: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  specifications: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  standard_plans: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  special_provisions: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  cpm_schedule: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export default function DocumentsPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>("other");
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

  // Fetch documents
  const { data: documents, refetch: refetchDocuments, isLoading } = trpc.documents.list.useQuery();

  // Upload mutation
  const uploadDocument = trpc.documents.upload.useMutation({
    onSuccess: () => {
      refetchDocuments();
      toast.success("Document uploaded successfully");
    },
    onError: (error) => {
      toast.error("Upload failed: " + error.message);
    },
  });

  // Delete mutation
  const deleteDocument = trpc.documents.delete.useMutation({
    onSuccess: () => {
      refetchDocuments();
      toast.success("Document deleted");
    },
    onError: (error) => {
      toast.error("Delete failed: " + error.message);
    },
  });

  const handleFileUpload = useCallback(async (files: FileList) => {
    const validTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    const maxSize = 200 * 1024 * 1024; // 200MB

    for (const file of Array.from(files)) {
      if (!validTypes.includes(file.type) && !file.name.endsWith('.txt')) {
        toast.error(`Invalid file type: ${file.name}. Only PDF, DOCX, and TXT files are supported.`);
        continue;
      }

      if (file.size > maxSize) {
        toast.error(`File too large: ${file.name}. Maximum size is 200MB.`);
        continue;
      }

      setUploadingFiles((prev) => [...prev, file.name]);

      try {
        // Read file as base64
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        // Determine file type
        let fileType: "pdf" | "docx" | "txt" = "txt";
        if (file.type === "application/pdf" || file.name.endsWith('.pdf')) {
          fileType = "pdf";
        } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.endsWith('.docx')) {
          fileType = "docx";
        }

        await uploadDocument.mutateAsync({
          filename: file.name,
          fileType,
          documentType: selectedType,
          fileData: base64,
          fileSize: file.size,
        });
      } catch (error) {
        console.error("Upload error:", error);
      } finally {
        setUploadingFiles((prev) => prev.filter((name) => name !== file.name));
      }
    }
  }, [selectedType, uploadDocument]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "processing":
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "pdf":
        return <FileText className="h-8 w-8 text-red-500" />;
      case "docx":
        return <FileType className="h-8 w-8 text-blue-500" />;
      default:
        return <File className="h-8 w-8 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground">
          Manage your construction plans, specifications, and schedules.
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upload New</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Document Type Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Document Type:</label>
            <Select value={selectedType} onValueChange={(v) => setSelectedType(v as DocumentType)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            )}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = ".pdf,.docx,.txt";
              input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) handleFileUpload(files);
              };
              input.click();
            }}
          >
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm font-medium">Click or drag to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              Support for PDF, DOCX, and TXT files. Max file size 200MB.
            </p>
          </div>

          {/* Upload Progress */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-2">
              {uploadingFiles.map((filename) => (
                <div key={filename} className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading {filename}...</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents Library */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Library</CardTitle>
          <span className="text-sm text-muted-foreground">
            {documents?.length || 0} Files
          </span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents && documents.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="grid gap-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    {/* File Icon */}
                    <div className="flex-shrink-0">
                      {getFileIcon(doc.fileType)}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">{doc.originalName}</h3>
                        {getStatusIcon(doc.processingStatus)}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(doc.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {formatFileSize(doc.fileSize)}
                        </span>
                        {doc.pageCount && (
                          <span>{doc.pageCount} pages</span>
                        )}
                      </div>
                    </div>

                    {/* Document Type Badge */}
                    <Badge
                      variant="secondary"
                      className={cn("flex-shrink-0", DOCUMENT_TYPE_COLORS[doc.documentType as DocumentType])}
                    >
                      {DOCUMENT_TYPE_LABELS[doc.documentType as DocumentType]}
                    </Badge>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>{doc.originalName}</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="h-[60vh]">
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="font-medium">Type</p>
                                  <p className="text-muted-foreground">
                                    {DOCUMENT_TYPE_LABELS[doc.documentType as DocumentType]}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-medium">Status</p>
                                  <p className="text-muted-foreground capitalize">
                                    {doc.processingStatus}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-medium">Size</p>
                                  <p className="text-muted-foreground">
                                    {formatFileSize(doc.fileSize)}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-medium">Pages</p>
                                  <p className="text-muted-foreground">
                                    {doc.pageCount || "Unknown"}
                                  </p>
                                </div>
                              </div>
                              {doc.extractedText && (
                                <div>
                                  <p className="font-medium mb-2">Extracted Text Preview</p>
                                  <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                                    {doc.extractedText.substring(0, 2000)}
                                    {doc.extractedText.length > 2000 && "..."}
                                  </div>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Document</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{doc.originalName}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteDocument.mutate({ id: doc.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet</p>
              <p className="text-sm">Upload your first construction document to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
