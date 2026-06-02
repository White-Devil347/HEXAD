// Load environment variables from .env file (development only)
if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  const dotenv = require('dotenv');

  // Prefer server/.env, but also support repo-root .env for convenience.
  dotenv.config({ path: path.resolve(__dirname, '.env') });
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const app = require('./app');
const connectDB = require('./config/db');
const apiClient = require('./utils/api-client');
const schemaManager = require('./utils/schemaManager');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`\n🚀 Starting Hexad Simulator Server`);
console.log(`📍 Environment: ${NODE_ENV}`);
console.log(`🔌 Port: ${PORT}\n`);
console.log(`🔐 Trusted internal key present: ${process.env.HEXAD_INTERNAL_KEY ? 'yes' : 'no'}`);

async function start() {
  try {
    // Connect to MongoDB (REQUIRED - no fallback)
    await connectDB();

    // Load persisted API config (if present)
    await apiClient.loadConfigFromDb();

    // Best-effort: warm schema cache for the configured upstream backend.
    try {
      const config = apiClient.getConfig();
      if (config?.baseURL) {
        await schemaManager.fetchSchema(`${config.baseURL}/schema/attendance`);
      }
    } catch (schemaErr) {
      console.warn('⚠ Schema warmup failed:', schemaErr.message);
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ API endpoints available at http://localhost:${PORT}/api`);
      console.log(`✓ Frontend available at http://localhost:${PORT}\n`);
    });
  } catch (error) {
    console.error('\n❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
