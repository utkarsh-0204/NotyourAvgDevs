import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import documentRoutes from './routes/documentRoutes.js';
import { DocumentController } from './controllers/documentController.js';
import { storageService } from './services/storageService.js';

import authRoutes from './routes/authRoutes.js';

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.get('/api/stats', DocumentController.getDashboardStats);
app.get('/api/samples', DocumentController.getSampleDocuments);
app.post('/api/samples/load', DocumentController.loadSampleDocument);
app.get('/api/health', DocumentController.getHealthAndStatus);

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'NyayaDrishti API - Indian Court Document Review Platform',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      documents: '/api/documents',
      samples: '/api/samples',
    },
  });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Path '${req.originalUrl}' not found.` });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Global Error Handler]:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'An unexpected server error occurred.',
    details: config.nodeEnv === 'development' ? err.stack : undefined,
  });
});

// Database Connection & Server Initialization
async function startServer() {
  console.log('[NyayaDrishti Server] Attempting connection to MongoDB at:', config.mongoUri);

  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log('[NyayaDrishti Server] Connected to MongoDB successfully.');
  } catch (err: any) {
    console.warn(`[NyayaDrishti Server] MongoDB connection warning: ${err.message}. Operating with in-memory resilient data store.`);
  }

  const reset = await storageService.resetInterruptedAnalyses();
  if (reset > 0) {
    console.log(`[NyayaDrishti Server] Reset ${reset} document(s) whose analysis was interrupted by a restart.`);
  }

  app.listen(config.port, () => {
    console.log(`[NyayaDrishti Server] Server running on http://localhost:${config.port}`);
    const aiMode = config.nvidiaApiKey
      ? `NVIDIA (${config.nvidiaModel})${config.geminiApiKey ? `, Gemini fallback (${config.geminiModel})` : ''}`
      : config.geminiApiKey
      ? `Active Gemini (${config.geminiModel})`
      : 'Local Rule-Based Deterministic Engine (Demo Mode)';
    console.log(`[NyayaDrishti Server] AI Mode: ${aiMode}`);
  });
}

startServer();
