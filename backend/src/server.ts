import 'dotenv/config';

import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { startDeletionRecovery } from './services/accountDeletion.js';
import { configureDnsServers } from './config/dns.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function startServer(): Promise<void> {
  try {
    configureDnsServers();
    // Connect to MongoDB
    await connectDatabase();
    const stopDeletionRecovery = startDeletionRecovery();

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health`);
      console.log(`   Upload route: POST http://localhost:${PORT}/api/profile/upload\n`);
    });

    // ─── Graceful Shutdown ─────────────────────────────────

    const shutdown = async (signal: string) => {
      stopDeletionRecovery();
      console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        console.log('👋 Server stopped.');
        process.exit(0);
      });

      // Force exit after 10s if graceful shutdown hangs
      setTimeout(() => {
        console.error('⚠️  Forced exit after timeout');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('server_start_failed');
    process.exit(1);
  }
}

startServer();
