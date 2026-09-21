import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: Number(process.env.PORT || 5000),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),

  // PostgreSQL
  databaseUrl: process.env.DATABASE_URL || '',
  dbSsl: process.env.DB_SSL !== undefined
    ? process.env.DB_SSL === 'true'
    : (Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes('localhost') && !process.env.DATABASE_URL?.includes('127.0.0.1')),

  // JWT auth
  jwtSecret: process.env.JWT_SECRET || 'sita_production_jwt_secret_key_2026_fallback',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // File uploads
  uploadsDir: process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads'),
};
