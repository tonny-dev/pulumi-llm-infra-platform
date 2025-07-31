export interface CodeAnalysisRequest {
  id?: string;
  fileName: string;
  language: string;
  code: string;
  analysisType: 'security' | 'performance' | 'quality' | 'architecture' | 'testing' | 'comprehensive';
  context?: string;
  specificConcerns?: string;
  diffContext?: string;
  userId?: string;
  repositoryId?: string;
  pullRequestId?: string;
}

export interface CodeIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: 'security' | 'performance' | 'quality' | 'architecture' | 'testing' | 'style';
  line: number;
  column?: number;
  message: string;
  suggestion: string;
  codeSnippet?: string;
  ruleId?: string;
  confidence?: number;
}

export interface CodeSuggestion {
  type: 'improvement' | 'refactor' | 'optimization' | 'modernization';
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  codeExample?: string;
  references?: string[];
}

export interface CodeMetrics {
  complexity: number;
  maintainability: number;
  testability: number;
  security: number;
  performance?: number;
  linesOfCode?: number;
  technicalDebt?: number;
}

export interface CodeAnalysisResponse {
  id: string;
  fileName: string;
  language: string;
  analysisType: string;
  timestamp: string;
  summary: string;
  issues: CodeIssue[];
  suggestions: CodeSuggestion[];
  metrics: CodeMetrics;
  confidence: number;
  processingTime: number;
  model?: string;
  version?: string;
}

export interface LLMProvider {
  name: string;
  endpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  isAvailable: boolean;
}

export interface BatchAnalysisRequest {
  requests: CodeAnalysisRequest[];
  priority: 'high' | 'medium' | 'low';
  callback?: string;
}

export interface BatchAnalysisResponse {
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: CodeAnalysisResponse[];
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  startTime: string;
  endTime?: string;
}

export interface LLMUsageMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  tokensUsed: number;
  cost: number;
  period: string;
}

export interface AnalysisJob {
  id: string;
  type: 'single' | 'batch' | 'repository';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  data: CodeAnalysisRequest | BatchAnalysisRequest;
  result?: CodeAnalysisResponse | BatchAnalysisResponse;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface LLMConfiguration {
  provider: 'openai' | 'anthropic' | 'custom';
  model: string;
  apiKey: string;
  baseURL?: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface RepositoryAnalysis {
  repositoryId: string;
  repositoryName: string;
  branch: string;
  commit: string;
  totalFiles: number;
  analyzedFiles: number;
  overallScore: number;
  issues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  languages: Record<string, number>;
  metrics: CodeMetrics;
  trends: {
    period: string;
    scoreChange: number;
    issueChange: number;
  };
  createdAt: string;
  updatedAt: string;
}
