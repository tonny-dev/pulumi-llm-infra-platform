import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// GraphQL
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';

// Services
import { LLMService } from '../services/llm/LLMService';
import { SubscriptionService } from '../services/subscription/SubscriptionService';
import { GitHubService } from '../services/github/GitHubService';

// Utils
import { logger } from '../shared/utils/logger';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    // Create Express app
    const app = express();
    const httpServer = createServer(app);

    // Initialize Socket.IO
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    // Middleware
    app.use(helmet({
      contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
    }));
    app.use(cors({
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    }));
    app.use(compression());
    app.use(morgan('combined'));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
    });
    app.use('/api/', limiter);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV,
      });
    });

    // API health check
    app.get('/api/health', async (req, res) => {
      try {
        // You can add database connectivity checks here
        res.status(200).json({
          status: 'healthy',
          services: {
            database: 'connected',
            redis: 'connected',
            llm: 'available',
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Health check failed', { error });
        res.status(503).json({
          status: 'unhealthy',
          error: 'Service unavailable',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Initialize services (mock for now)
    const llmService = new LLMService(
      process.env.LLM_API_KEY || 'mock-key',
      process.env.LLM_BASE_URL
    );

    // Create Apollo Server
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      context: ({ req, res }) => ({
        req,
        res,
        user: req.user, // Will be set by auth middleware
        services: {
          llm: llmService,
        },
      }),
      introspection: NODE_ENV !== 'production',
      playground: NODE_ENV !== 'production',
    });

    await apolloServer.start();
    apolloServer.applyMiddleware({ 
      app, 
      path: '/graphql',
      cors: false, // We handle CORS above
    });

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      socket.on('join-analysis', (analysisId) => {
        socket.join(`analysis-${analysisId}`);
        logger.info('Client joined analysis room', { socketId: socket.id, analysisId });
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
      });
    });

    // REST API routes
    app.use('/api/analysis', require('./routes/analysis'));
    app.use('/api/repositories', require('./routes/repositories'));
    app.use('/api/subscription', require('./routes/subscription'));
    app.use('/api/auth', require('./routes/auth'));

    // Serve static files in production
    if (NODE_ENV === 'production') {
      app.use(express.static('client/dist'));
      app.get('*', (req, res) => {
        res.sendFile('index.html', { root: 'client/dist' });
      });
    }

    // Error handling middleware
    app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', { error, url: req.url, method: req.method });
      res.status(500).json({
        error: 'Internal server error',
        message: NODE_ENV === 'development' ? error.message : 'Something went wrong',
      });
    });

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server ready at http://localhost:${PORT}`);
      logger.info(`🚀 GraphQL endpoint: http://localhost:${PORT}${apolloServer.graphqlPath}`);
      logger.info(`🌍 Environment: ${NODE_ENV}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      httpServer.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error });
  process.exit(1);
});

startServer();
