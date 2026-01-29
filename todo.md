# Construction Document AI Agent - Project TODO

## Core Features

- [x] Document upload system (PDF, DOCX, TXT) with S3 storage
- [x] Document text extraction and parsing
- [x] AI chat interface with message streaming
- [x] Conversation history persistence
- [x] Source citation with page numbers and sections
- [x] Construction-specific calculations (quantities, measurements, materials)
- [x] Automated report generation (requirements, specs, critical path)
- [x] Project scheduling analysis (timelines, milestones, dependencies)
- [x] Multi-document conflict detection
- [x] Document management interface with metadata display
- [x] User authentication and per-user document isolation
- [x] Secure cloud storage with URL-based access
- [x] Construction terminology NLP understanding
- [x] Owner notification for critical uploads and conflicts

## UI Components

- [x] Dashboard layout with sidebar navigation
- [x] Chat assistant page with message history
- [x] Documents page with upload and library
- [x] Settings page for user preferences
- [x] Document viewer with source highlighting

## Database Schema

- [x] Users table (authentication)
- [x] Documents table (file metadata, S3 references)
- [x] Conversations table (chat sessions)
- [x] Messages table (chat history with citations)
- [x] Document chunks table (parsed text segments for RAG)

## API Endpoints

- [x] Document upload endpoint
- [x] Document list/delete endpoints
- [x] Chat message endpoint with streaming
- [x] Report generation endpoint
- [x] Calculation endpoint
- [x] Schedule analysis endpoint

## Bugs

- [x] AI agent says it can read documents but doesn't provide answers from document content (FIXED: Added proactive document search)
