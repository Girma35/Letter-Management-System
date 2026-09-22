import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import departmentsRoutes from './routes/departments.routes';
import documentsRoutes from './routes/documents.routes';
import approvalsRoutes from './routes/approvals.routes';
import commentsRoutes from './routes/comments.routes';
import notificationsRoutes from './routes/notifications.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportsRoutes from './routes/reports.routes';
import tasksRoutes from './routes/tasks.routes';

const app = express();

const allowedOrigins = config.corsOrigin;

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, mobile apps, curl)
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      // Production frontend (Vercel) — keep explicitly so it works even if the
      // platform domain rules ever change.
      origin === 'https://letter-management-system-jade.vercel.app' ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.railway.app') ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    // Deny unknown origins. Never fall back to `*` here: credentials are
    // enabled, and browsers reject `Access-Control-Allow-Origin: *` with
    // `Access-Control-Allow-Credentials: true`.
    return callback(null, isAllowed);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically (useful for direct link previews in the frontend).
app.use('/uploads', express.static(path.resolve(config.uploadsDir)));

// Health check (unauthenticated).
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'letter-management-backend', time: new Date().toISOString() });
});

app.get('/api/health/letters', (_req, res) => {
  res.json({ status: 'ok', service: 'letter-management-letter-service', time: new Date().toISOString() });
});

// All routes are served under /api to match the frontend's base URL.
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/letters', documentsRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/documents', commentsRoutes); // comments live under /api/documents/:id/comments
app.use('/api/letters', commentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/tasks', tasksRoutes);

// System capacity summary for admin pages
app.get('/api/system/capacity', (_req, res) => {
  res.json({
    total_licenses: 100,
    used_licenses: 14,
    utilization_percent: 14,
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] Letter Management API listening on http://0.0.0.0:${config.port}/api`);
  console.log(`[server] Environment: ${config.nodeEnv}`);
  console.log(`[server] Uploads directory: ${config.uploadsDir}`);
});

export default app;
