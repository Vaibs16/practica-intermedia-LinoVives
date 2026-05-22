import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import router from './routes/user.routes.js';
import clientRouter from './routes/client.routes.js';
import projectRouter from './routes/project.routes.js';
import deliveryNoteRouter from './routes/deliverynote.routes.js';
import mongoSanitizeMiddleware from './middleware/sanitize.middleware.js';
import limiter from './middleware/rate-limiter.middleware.js';
import errorHandler from './middleware/errorHandler.middleware.js';
import morganBody from 'morgan-body';
import { loggerStream } from './utils/handleLogger.js';

const app = express();

app.use(express.json());

morganBody(app, {
  noColors: true,
  skip: (req, res) => res.statusCode < 500,
  stream: loggerStream
});

app.use(helmet());
app.use(mongoSanitizeMiddleware);

app.use('/api', limiter);

app.use('/api/user', router);
app.use('/api/client', clientRouter);
app.use('/api/project', projectRouter);
app.use('/api/deliverynote', deliveryNoteRouter);
app.use('/uploads', express.static('uploads'));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
app.get('/test-error', (req, res) => { throw new Error('Error de prueba para Slack'); });

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

export default app;