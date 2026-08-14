import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const SHUTDOWN_GRACE_MS = 30_000;

const config = loadConfig();
const app = buildApp({
  maxUploadBytes: config.maxUploadBytes,
  logger: { level: config.logLevel },
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down, draining in-flight requests');
    // If draining exceeds the grace period (e.g. a stalled upload), exit anyway so the
    // orchestrator's stop-timeout doesn't have to SIGKILL us.
    setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
