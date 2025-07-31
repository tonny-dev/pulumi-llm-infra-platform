import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const analysisTime = new Trend('analysis_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 20 }, // Ramp up to 20 users
    { duration: '5m', target: 20 }, // Stay at 20 users
    { duration: '2m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.1'],     // Error rate must be below 10%
    errors: ['rate<0.1'],              // Custom error rate below 10%
    analysis_duration: ['p(95)<5000'], // 95% of analyses complete below 5s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Sample code for analysis
const sampleCode = `
function calculateFibonacci(n) {
  if (n <= 1) return n;
  return calculateFibonacci(n - 1) + calculateFibonacci(n - 2);
}

class UserService {
  constructor(database) {
    this.db = database;
  }

  async createUser(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    return this.db.users.create({
      ...userData,
      password: hashedPassword
    });
  }

  async getUserById(id) {
    return this.db.users.findById(id);
  }
}

module.exports = { UserService, calculateFibonacci };
`;

export function setup() {
  // Authenticate and get token
  const loginResponse = http.post(`${BASE_URL}/api/auth/login`, {
    email: 'test@example.com',
    password: 'testpassword'
  });
  
  const token = loginResponse.json('token');
  return { token };
}

export default function(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  // Test 1: Single code analysis
  const analysisPayload = {
    fileName: 'test-service.js',
    language: 'javascript',
    code: sampleCode,
    analysisType: 'comprehensive',
    context: 'Load testing sample code'
  };

  const analysisStart = Date.now();
  const analysisResponse = http.post(
    `${BASE_URL}/api/analysis/analyze`,
    JSON.stringify(analysisPayload),
    { headers }
  );

  const analysisEnd = Date.now();
  analysisTime.add(analysisEnd - analysisStart);

  const analysisSuccess = check(analysisResponse, {
    'analysis status is 200': (r) => r.status === 200,
    'analysis has results': (r) => r.json('summary') !== undefined,
    'analysis has issues': (r) => Array.isArray(r.json('issues')),
    'analysis has metrics': (r) => r.json('metrics') !== undefined,
  });

  errorRate.add(!analysisSuccess);

  // Test 2: Health check
  const healthResponse = http.get(`${BASE_URL}/api/health`, { headers });
  
  check(healthResponse, {
    'health status is 200': (r) => r.status === 200,
    'health response is valid': (r) => r.json('status') === 'healthy',
  });

  // Test 3: GraphQL query
  const graphqlQuery = {
    query: `
      query GetAnalyses($limit: Int) {
        getAnalyses(limit: $limit) {
          id
          fileName
          language
          summary
          metrics {
            complexity
            maintainability
          }
        }
      }
    `,
    variables: { limit: 5 }
  };

  const graphqlResponse = http.post(
    `${BASE_URL}/graphql`,
    JSON.stringify(graphqlQuery),
    { headers }
  );

  check(graphqlResponse, {
    'graphql status is 200': (r) => r.status === 200,
    'graphql has data': (r) => r.json('data') !== undefined,
    'graphql no errors': (r) => r.json('errors') === undefined,
  });

  // Test 4: Batch analysis (less frequent)
  if (Math.random() < 0.3) { // 30% chance
    const batchPayload = {
      requests: [
        {
          fileName: 'batch-test-1.js',
          language: 'javascript',
          code: 'console.log("test 1");',
          analysisType: 'quality'
        },
        {
          fileName: 'batch-test-2.js',
          language: 'javascript',
          code: 'console.log("test 2");',
          analysisType: 'security'
        }
      ],
      priority: 'medium'
    };

    const batchResponse = http.post(
      `${BASE_URL}/api/analysis/batch`,
      JSON.stringify(batchPayload),
      { headers }
    );

    check(batchResponse, {
      'batch status is 200': (r) => r.status === 200,
      'batch has batchId': (r) => r.json('batchId') !== undefined,
    });
  }

  // Random sleep between 1-3 seconds
  sleep(Math.random() * 2 + 1);
}

export function teardown(data) {
  // Cleanup if needed
  console.log('Load test completed');
}

// Scenario-based testing
export const scenarios = {
  // Constant load
  constant_load: {
    executor: 'constant-vus',
    vus: 10,
    duration: '5m',
    tags: { scenario: 'constant' },
  },
  
  // Spike testing
  spike_test: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 50 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 },
    ],
    tags: { scenario: 'spike' },
  },
  
  // Stress testing
  stress_test: {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 100,
    stages: [
      { duration: '2m', target: 10 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 0 },
    ],
    tags: { scenario: 'stress' },
  },
};
