import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  scalar DateTime
  scalar JSON

  enum AnalysisType {
    SECURITY
    PERFORMANCE
    QUALITY
    ARCHITECTURE
    TESTING
    COMPREHENSIVE
  }

  enum IssueSeverity {
    CRITICAL
    HIGH
    MEDIUM
    LOW
    INFO
  }

  enum IssueType {
    SECURITY
    PERFORMANCE
    QUALITY
    ARCHITECTURE
    TESTING
    STYLE
  }

  enum SuggestionType {
    IMPROVEMENT
    REFACTOR
    OPTIMIZATION
    MODERNIZATION
  }

  enum Impact {
    HIGH
    MEDIUM
    LOW
  }

  enum JobStatus {
    QUEUED
    PROCESSING
    COMPLETED
    FAILED
  }

  type CodeIssue {
    severity: IssueSeverity!
    type: IssueType!
    line: Int!
    column: Int
    message: String!
    suggestion: String!
    codeSnippet: String
    ruleId: String
    confidence: Float
  }

  type CodeSuggestion {
    type: SuggestionType!
    description: String!
    impact: Impact!
    effort: Impact!
    codeExample: String
    references: [String!]
  }

  type CodeMetrics {
    complexity: Float!
    maintainability: Float!
    testability: Float!
    security: Float!
    performance: Float
    linesOfCode: Int
    technicalDebt: Float
  }

  type CodeAnalysisResponse {
    id: ID!
    fileName: String!
    language: String!
    analysisType: AnalysisType!
    timestamp: DateTime!
    summary: String!
    issues: [CodeIssue!]!
    suggestions: [CodeSuggestion!]!
    metrics: CodeMetrics!
    confidence: Float!
    processingTime: Int!
    model: String
    version: String
  }

  type RepositoryAnalysis {
    id: ID!
    repositoryId: String!
    repositoryName: String!
    branch: String!
    commit: String!
    totalFiles: Int!
    analyzedFiles: Int!
    overallScore: Float!
    issues: IssuesSummary!
    languages: JSON!
    metrics: CodeMetrics!
    trends: AnalysisTrends
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type IssuesSummary {
    critical: Int!
    high: Int!
    medium: Int!
    low: Int!
    total: Int!
  }

  type AnalysisTrends {
    period: String!
    scoreChange: Float!
    issueChange: Int!
  }

  type AnalysisJob {
    id: ID!
    type: String!
    status: JobStatus!
    priority: Int!
    createdAt: DateTime!
    startedAt: DateTime
    completedAt: DateTime
    result: CodeAnalysisResponse
    error: String
    retryCount: Int!
    maxRetries: Int!
    progress: Float
  }

  type BatchAnalysisResponse {
    batchId: ID!
    status: JobStatus!
    results: [CodeAnalysisResponse!]!
    totalRequests: Int!
    completedRequests: Int!
    failedRequests: Int!
    startTime: DateTime!
    endTime: DateTime
    progress: Float!
  }

  type LLMHealth {
    status: String!
    latency: Int!
    model: String!
    timestamp: DateTime!
  }

  type UsageMetrics {
    totalRequests: Int!
    successfulRequests: Int!
    failedRequests: Int!
    averageLatency: Float!
    tokensUsed: Int!
    cost: Float!
    period: String!
  }

  type User {
    id: ID!
    email: String!
    name: String!
    role: String!
    createdAt: DateTime!
    lastLoginAt: DateTime
    isActive: Boolean!
  }

  type Repository {
    id: ID!
    name: String!
    url: String!
    branch: String!
    language: String!
    isActive: Boolean!
    lastAnalyzedAt: DateTime
    owner: User!
    analyses: [RepositoryAnalysis!]!
  }

  input CodeAnalysisInput {
    fileName: String!
    language: String!
    code: String!
    analysisType: AnalysisType!
    context: String
    specificConcerns: String
    diffContext: String
    repositoryId: String
    pullRequestId: String
  }

  input BatchAnalysisInput {
    requests: [CodeAnalysisInput!]!
    priority: Impact = MEDIUM
    callback: String
  }

  input RepositoryInput {
    name: String!
    url: String!
    branch: String = "main"
    language: String
  }

  input AnalysisFilters {
    analysisType: AnalysisType
    severity: IssueSeverity
    language: String
    dateFrom: DateTime
    dateTo: DateTime
    repositoryId: String
  }

  type Query {
    # Analysis queries
    getAnalysis(id: ID!): CodeAnalysisResponse
    getAnalyses(filters: AnalysisFilters, limit: Int = 20, offset: Int = 0): [CodeAnalysisResponse!]!
    getBatchAnalysis(batchId: ID!): BatchAnalysisResponse
    getJob(id: ID!): AnalysisJob
    getJobs(status: JobStatus, limit: Int = 20, offset: Int = 0): [AnalysisJob!]!
    
    # Repository queries
    getRepository(id: ID!): Repository
    getRepositories(limit: Int = 20, offset: Int = 0): [Repository!]!
    getRepositoryAnalysis(repositoryId: String!, analysisId: String): RepositoryAnalysis
    getRepositoryAnalyses(repositoryId: String!, limit: Int = 20, offset: Int = 0): [RepositoryAnalysis!]!
    
    # Health and metrics
    getLLMHealth: LLMHealth!
    getUsageMetrics(period: String = "24h"): UsageMetrics!
    
    # User queries
    getCurrentUser: User
    getUsers(limit: Int = 20, offset: Int = 0): [User!]!
  }

  type Mutation {
    # Analysis mutations
    analyzeCode(input: CodeAnalysisInput!): CodeAnalysisResponse!
    analyzeBatch(input: BatchAnalysisInput!): BatchAnalysisResponse!
    analyzeRepository(repositoryId: String!, branch: String = "main"): RepositoryAnalysis!
    
    # Job management
    cancelJob(id: ID!): Boolean!
    retryJob(id: ID!): AnalysisJob!
    
    # Repository management
    addRepository(input: RepositoryInput!): Repository!
    updateRepository(id: ID!, input: RepositoryInput!): Repository!
    deleteRepository(id: ID!): Boolean!
    
    # User management
    updateUser(id: ID!, name: String, role: String): User!
    deactivateUser(id: ID!): Boolean!
  }

  type Subscription {
    # Real-time analysis updates
    analysisProgress(jobId: ID!): AnalysisJob!
    batchProgress(batchId: ID!): BatchAnalysisResponse!
    
    # Repository updates
    repositoryAnalysisUpdate(repositoryId: String!): RepositoryAnalysis!
    
    # System health
    llmHealthUpdate: LLMHealth!
    usageMetricsUpdate: UsageMetrics!
  }
`;
