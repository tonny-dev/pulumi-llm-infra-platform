import { LLMService } from '../LLMService';
import { CodeAnalysisRequest, CodeAnalysisResponse } from '@/shared/types/llm';
import { CircuitBreaker, CircuitBreakerState } from '@/shared/utils/circuit-breaker';
import nock from 'nock';

// Mock dependencies
jest.mock('@/shared/utils/logger');
jest.mock('@/shared/utils/circuit-breaker');
jest.mock('@/shared/utils/rate-limiter');
jest.mock('@/shared/utils/metrics');

describe('LLMService', () => {
  let llmService: LLMService;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;

  const mockApiKey = 'test-api-key';
  const mockBaseURL = 'https://test-llm-endpoint.com/v1';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock CircuitBreaker
    mockCircuitBreaker = {
      execute: jest.fn(),
      getState: jest.fn().mockReturnValue(CircuitBreakerState.CLOSED),
      isOpen: jest.fn().mockReturnValue(false),
      isClosed: jest.fn().mockReturnValue(true),
      isHalfOpen: jest.fn().mockReturnValue(false),
    } as any;

    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(() => mockCircuitBreaker);

    llmService = new LLMService(mockApiKey, mockBaseURL);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('analyzeCode', () => {
    const mockRequest: CodeAnalysisRequest = {
      fileName: 'test.ts',
      language: 'typescript',
      code: 'function test() { return "hello"; }',
      analysisType: 'quality',
      context: 'Unit test function'
    };

    const mockLLMResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Code looks good with minor improvements needed',
            issues: [{
              severity: 'low',
              type: 'quality',
              line: 1,
              column: 1,
              message: 'Function could use type annotations',
              suggestion: 'Add return type annotation',
              codeSnippet: 'function test(): string'
            }],
            suggestions: [{
              type: 'improvement',
              description: 'Add TypeScript type annotations',
              impact: 'Improves code maintainability'
            }],
            metrics: {
              complexity: 1,
              maintainability: 8,
              testability: 9,
              security: 10
            }
          })
        }
      }],
      model: 'gpt-4-turbo-preview'
    };

    it('should successfully analyze code', async () => {
      // Mock the OpenAI API call
      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(200, mockLLMResponse);

      // Mock circuit breaker to execute the operation
      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      const result = await llmService.analyzeCode(mockRequest);

      expect(result).toBeDefined();
      expect(result.fileName).toBe(mockRequest.fileName);
      expect(result.language).toBe(mockRequest.language);
      expect(result.analysisType).toBe(mockRequest.analysisType);
      expect(result.summary).toBe('Code looks good with minor improvements needed');
      expect(result.issues).toHaveLength(1);
      expect(result.suggestions).toHaveLength(1);
      expect(result.metrics).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle LLM API errors gracefully', async () => {
      // Mock API error
      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(500, { error: 'Internal server error' });

      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      await expect(llmService.analyzeCode(mockRequest)).rejects.toThrow();
    });

    it('should handle circuit breaker open state', async () => {
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Circuit breaker is OPEN'));

      await expect(llmService.analyzeCode(mockRequest)).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should handle invalid JSON response', async () => {
      const invalidResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      };

      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(200, invalidResponse);

      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      await expect(llmService.analyzeCode(mockRequest)).rejects.toThrow('Invalid LLM response format');
    });

    it('should handle empty response', async () => {
      const emptyResponse = {
        choices: [{
          message: {
            content: null
          }
        }]
      };

      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(200, emptyResponse);

      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      await expect(llmService.analyzeCode(mockRequest)).rejects.toThrow('Empty response from LLM');
    });
  });

  describe('batchAnalyze', () => {
    const mockRequests: CodeAnalysisRequest[] = [
      {
        fileName: 'test1.ts',
        language: 'typescript',
        code: 'function test1() {}',
        analysisType: 'quality'
      },
      {
        fileName: 'test2.ts',
        language: 'typescript',
        code: 'function test2() {}',
        analysisType: 'security'
      }
    ];

    it('should process batch requests successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Batch analysis complete',
              issues: [],
              suggestions: [],
              metrics: { complexity: 1, maintainability: 8, testability: 9, security: 10 }
            })
          }
        }]
      };

      // Mock multiple API calls
      nock(mockBaseURL)
        .post('/chat/completions')
        .times(2)
        .reply(200, mockResponse);

      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      const results = await llmService.batchAnalyze(mockRequests);

      expect(results).toHaveLength(2);
      expect(results[0].fileName).toBe('test1.ts');
      expect(results[1].fileName).toBe('test2.ts');
    });

    it('should handle partial failures in batch processing', async () => {
      const successResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Success',
              issues: [],
              suggestions: [],
              metrics: { complexity: 1, maintainability: 8, testability: 9, security: 10 }
            })
          }
        }]
      };

      // First request succeeds, second fails
      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(200, successResponse)
        .post('/chat/completions')
        .reply(500, { error: 'Server error' });

      let callCount = 0;
      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('API Error');
        }
        return await operation();
      });

      const results = await llmService.batchAnalyze(mockRequests);

      // Should return only successful results
      expect(results).toHaveLength(1);
      expect(results[0].fileName).toBe('test1.ts');
    });
  });

  describe('getModelHealth', () => {
    it('should return healthy status when API is responsive', async () => {
      const healthResponse = {
        choices: [{
          message: {
            content: 'OK'
          }
        }],
        model: 'gpt-3.5-turbo'
      };

      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(200, healthResponse);

      const health = await llmService.getModelHealth();

      expect(health.status).toBe('healthy');
      expect(health.model).toBe('gpt-3.5-turbo');
      expect(health.latency).toBeGreaterThan(0);
    });

    it('should return unhealthy status when API is not responsive', async () => {
      nock(mockBaseURL)
        .post('/chat/completions')
        .reply(500, { error: 'Service unavailable' });

      const health = await llmService.getModelHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.model).toBe('unknown');
      expect(health.latency).toBeGreaterThan(0);
    });
  });

  describe('buildSystemPrompt', () => {
    it('should generate appropriate prompts for different analysis types', () => {
      const service = llmService as any; // Access private method for testing
      
      const securityPrompt = service.buildSystemPrompt('security');
      expect(securityPrompt).toContain('security vulnerabilities');
      
      const performancePrompt = service.buildSystemPrompt('performance');
      expect(performancePrompt).toContain('performance bottlenecks');
      
      const qualityPrompt = service.buildSystemPrompt('quality');
      expect(qualityPrompt).toContain('code quality');
    });
  });

  describe('calculateConfidence', () => {
    it('should calculate confidence based on response completeness', () => {
      const service = llmService as any; // Access private method for testing
      
      const completeAnalysis = {
        issues: [{ severity: 'high', message: 'Issue' }],
        suggestions: [{ type: 'improvement', description: 'Suggestion' }],
        metrics: { complexity: 5 }
      };
      
      const confidence = service.calculateConfidence(completeAnalysis);
      expect(confidence).toBe(1.0);
      
      const incompleteAnalysis = {
        issues: [],
        suggestions: [],
        metrics: {}
      };
      
      const lowConfidence = service.calculateConfidence(incompleteAnalysis);
      expect(lowConfidence).toBe(0.5);
    });
  });
});

// Integration tests
describe('LLMService Integration Tests', () => {
  let llmService: LLMService;

  beforeAll(() => {
    // Use real dependencies for integration tests
    jest.unmock('@/shared/utils/circuit-breaker');
    jest.unmock('@/shared/utils/rate-limiter');
    jest.unmock('@/shared/utils/metrics');
  });

  beforeEach(() => {
    llmService = new LLMService('test-key', 'https://api.openai.com/v1');
  });

  it('should handle rate limiting correctly', async () => {
    const request: CodeAnalysisRequest = {
      fileName: 'test.ts',
      language: 'typescript',
      code: 'console.log("test");',
      analysisType: 'quality'
    };

    // Mock rate limiter to reject
    const rateLimiter = (llmService as any).rateLimiter;
    rateLimiter.consume = jest.fn().mockRejectedValue(new Error('Rate limit exceeded'));

    await expect(llmService.analyzeCode(request)).rejects.toThrow('Rate limit exceeded');
  });

  it('should respect circuit breaker state changes', async () => {
    const circuitBreaker = (llmService as any).circuitBreaker;
    
    // Force circuit breaker to open state
    circuitBreaker.forceOpen();
    
    const request: CodeAnalysisRequest = {
      fileName: 'test.ts',
      language: 'typescript',
      code: 'console.log("test");',
      analysisType: 'quality'
    };

    await expect(llmService.analyzeCode(request)).rejects.toThrow('Circuit breaker is OPEN');
  });
});
