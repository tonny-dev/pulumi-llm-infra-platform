import { OpenAI } from 'openai';
import { ChatCompletionCreateParams } from 'openai/resources/chat';
import { logger } from '@/shared/utils/logger';
import { CodeAnalysisRequest, CodeAnalysisResponse, LLMProvider } from '@/shared/types/llm';
import { CircuitBreaker } from '@/shared/utils/circuit-breaker';
import { RateLimiter } from '@/shared/utils/rate-limiter';
import { MetricsCollector } from '@/shared/utils/metrics';

export class LLMService {
  private openai: OpenAI;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private metrics: MetricsCollector;
  private readonly maxRetries = 3;
  private readonly timeout = 30000; // 30 seconds

  constructor(
    private apiKey: string,
    private baseURL?: string // Your Pulumi-deployed LLM endpoint
  ) {
    this.openai = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL || 'https://api.openai.com/v1',
      timeout: this.timeout,
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringPeriod: 10000,
    });

    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 100,
      interval: 60000, // 1 minute
    });

    this.metrics = new MetricsCollector('llm_service');
  }

  async analyzeCode(request: CodeAnalysisRequest): Promise<CodeAnalysisResponse> {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      await this.rateLimiter.consume();

      // Circuit breaker protection
      const result = await this.circuitBreaker.execute(async () => {
        return await this.performCodeAnalysis(request);
      });

      this.metrics.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.recordError(Date.now() - startTime);
      logger.error('LLM code analysis failed', { error, request });
      throw error;
    }
  }

  private async performCodeAnalysis(request: CodeAnalysisRequest): Promise<CodeAnalysisResponse> {
    const systemPrompt = this.buildSystemPrompt(request.analysisType);
    const userPrompt = this.buildUserPrompt(request);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('Empty response from LLM');
    }

    return this.parseAnalysisResponse(response, request);
  }

  private buildSystemPrompt(analysisType: string): string {
    const basePrompt = `You are a senior software engineer and code reviewer with expertise in multiple programming languages, design patterns, and best practices.`;
    
    const typeSpecificPrompts = {
      'security': `Focus on security vulnerabilities, potential exploits, and secure coding practices.`,
      'performance': `Analyze performance bottlenecks, optimization opportunities, and scalability concerns.`,
      'quality': `Evaluate code quality, maintainability, readability, and adherence to best practices.`,
      'architecture': `Review architectural decisions, design patterns, and system design principles.`,
      'testing': `Assess test coverage, test quality, and suggest testing improvements.`,
      'comprehensive': `Provide a comprehensive review covering security, performance, quality, and architecture.`
    };

    return `${basePrompt} ${typeSpecificPrompts[analysisType] || typeSpecificPrompts.comprehensive}

Return your analysis as a JSON object with the following structure:
{
  "summary": "Brief overview of findings",
  "issues": [
    {
      "severity": "high|medium|low",
      "type": "security|performance|quality|architecture|testing",
      "line": number,
      "column": number,
      "message": "Description of the issue",
      "suggestion": "Recommended fix",
      "codeSnippet": "Relevant code snippet"
    }
  ],
  "suggestions": [
    {
      "type": "improvement|refactor|optimization",
      "description": "Detailed suggestion",
      "impact": "Expected impact of the change"
    }
  ],
  "metrics": {
    "complexity": number,
    "maintainability": number,
    "testability": number,
    "security": number
  }
}`;
  }

  private buildUserPrompt(request: CodeAnalysisRequest): string {
    return `Please analyze the following code:

**File:** ${request.fileName}
**Language:** ${request.language}
**Context:** ${request.context || 'No additional context provided'}

\`\`\`${request.language}
${request.code}
\`\`\`

${request.specificConcerns ? `**Specific Concerns:** ${request.specificConcerns}` : ''}
${request.diffContext ? `**Changes Made:** ${request.diffContext}` : ''}`;
  }

  private parseAnalysisResponse(response: string, request: CodeAnalysisRequest): CodeAnalysisResponse {
    try {
      const parsed = JSON.parse(response);
      
      return {
        id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: request.fileName,
        language: request.language,
        analysisType: request.analysisType,
        timestamp: new Date().toISOString(),
        summary: parsed.summary,
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
        metrics: parsed.metrics || {},
        confidence: this.calculateConfidence(parsed),
        processingTime: 0 // Will be set by caller
      };
    } catch (error) {
      logger.error('Failed to parse LLM response', { error, response });
      throw new Error('Invalid LLM response format');
    }
  }

  private calculateConfidence(analysis: any): number {
    // Simple confidence calculation based on response completeness
    let confidence = 0.5;
    
    if (analysis.issues && analysis.issues.length > 0) confidence += 0.2;
    if (analysis.suggestions && analysis.suggestions.length > 0) confidence += 0.2;
    if (analysis.metrics && Object.keys(analysis.metrics).length > 0) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  async batchAnalyze(requests: CodeAnalysisRequest[]): Promise<CodeAnalysisResponse[]> {
    const batchSize = 5; // Process in batches to avoid overwhelming the API
    const results: CodeAnalysisResponse[] = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(request => this.analyzeCode(request));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            logger.error('Batch analysis failed for request', { 
              request: batch[index], 
              error: result.reason 
            });
          }
        });
      } catch (error) {
        logger.error('Batch processing error', { error, batch });
      }
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  async getModelHealth(): Promise<{ status: string; latency: number; model: string }> {
    const startTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Health check' }],
        max_tokens: 10
      });
      
      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        model: response.model
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        model: 'unknown'
      };
    }
  }
}
