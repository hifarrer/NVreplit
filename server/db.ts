// Load environment variables first, before any other imports
// Safe for production: dotenv only loads .env files if they exist and won't override existing env vars
import 'dotenv/config';

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Construct proper DATABASE_URL from individual components or use DATABASE_URL directly
const constructDatabaseUrl = () => {
  // First, check if DATABASE_URL is provided directly
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Otherwise, construct from individual components
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  const port = process.env.PGPORT || '5432';
  
  if (!host || !user || !password || !database) {
    throw new Error("Missing required PostgreSQL environment variables. Please provide either DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, and PGDATABASE");
  }
  
  // Construct the connection string with SSL required for Neon
  return `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
};

const connectionString = constructDatabaseUrl();

// Pool configuration with connection management for long-running tasks
export const pool = new Pool({ 
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

export const db = drizzle({ client: pool, schema });

// Utility function to execute database operations with retry logic
// Use this for critical operations that may fail due to connection issues
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; retryDelayMs?: number; operationName?: string } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelayMs = 1000, operationName = 'database operation' } = options;
  
  const isRetryableError = (error: any): boolean => {
    const message = error?.message || '';
    const code = error?.code || '';
    
    return (
      code === '57P01' || // admin_shutdown
      code === '57P02' || // crash_shutdown  
      code === '57P03' || // cannot_connect_now
      code === '08006' || // connection_failure
      code === '08001' || // sqlclient_unable_to_establish_sqlconnection
      code === '08004' || // sqlserver_rejected_establishment_of_sqlconnection
      message.includes('terminating connection') ||
      message.includes('connection terminated') ||
      message.includes('Connection terminated') ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('socket hang up')
    );
  };
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (isRetryableError(error) && attempt < maxRetries) {
        const delay = retryDelayMs * attempt; // Exponential backoff
        console.warn(`⚠️ ${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
        console.warn(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}
