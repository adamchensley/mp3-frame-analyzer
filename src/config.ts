export interface AppConfig {
  port: number;
  host: string;
  maxUploadBytes: number;
  logLevel: string;
}

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: positiveIntFromEnv(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    maxUploadBytes: positiveIntFromEnv(env.MAX_UPLOAD_BYTES, DEFAULT_MAX_UPLOAD_BYTES),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
