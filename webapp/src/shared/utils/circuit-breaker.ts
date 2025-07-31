import { EventEmitter } from 'events';
import { logger } from './logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrorRate?: number;
  minimumThroughput?: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  errorRate: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateChangedAt: Date;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private stateChangedAt = new Date();
  private nextAttempt?: Date;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(private options: CircuitBreakerOptions) {
    super();
    this.startMonitoring();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.setState(CircuitBreakerState.HALF_OPEN);
      } else {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      }
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.setState(CircuitBreakerState.CLOSED);
      this.reset();
    }

    this.emit('success', this.getMetrics());
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.setState(CircuitBreakerState.OPEN);
      this.scheduleNextAttempt();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      if (this.shouldTrip()) {
        this.setState(CircuitBreakerState.OPEN);
        this.scheduleNextAttempt();
      }
    }

    this.emit('failure', this.getMetrics());
  }

  private shouldTrip(): boolean {
    const errorRate = this.failureCount / this.totalRequests;
    const minimumThroughput = this.options.minimumThroughput || 10;
    
    return (
      this.failureCount >= this.options.failureThreshold &&
      this.totalRequests >= minimumThroughput &&
      errorRate >= (this.options.expectedErrorRate || 0.5)
    );
  }

  private shouldAttemptReset(): boolean {
    return (
      this.nextAttempt !== undefined &&
      new Date() >= this.nextAttempt
    );
  }

  private setState(newState: CircuitBreakerState): void {
    const previousState = this.state;
    this.state = newState;
    this.stateChangedAt = new Date();

    logger.info('Circuit breaker state changed', {
      from: previousState,
      to: newState,
      metrics: this.getMetrics()
    });

    this.emit('stateChange', {
      from: previousState,
      to: newState,
      metrics: this.getMetrics()
    });
  }

  private scheduleNextAttempt(): void {
    this.nextAttempt = new Date(Date.now() + this.options.recoveryTimeout);
  }

  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.nextAttempt = undefined;
  }

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.emit('metrics', this.getMetrics());
      
      // Reset counters periodically to prevent stale data
      if (this.state === CircuitBreakerState.CLOSED && this.totalRequests > 1000) {
        this.reset();
      }
    }, this.options.monitoringPeriod);
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      errorRate: this.totalRequests > 0 ? this.failureCount / this.totalRequests : 0,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt
    };
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  forceOpen(): void {
    this.setState(CircuitBreakerState.OPEN);
    this.scheduleNextAttempt();
  }

  forceClose(): void {
    this.setState(CircuitBreakerState.CLOSED);
    this.reset();
  }

  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    this.removeAllListeners();
  }
}
