require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');
const logger = require('./utils/logger');
const syncEngine = require('./services/syncEngine');
const { seedDemoData } = require('./utils/demoSeed');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api', limiter);

// Routes
app.use('/api/sync', require('./routes/sync'));
app.use('/api/configs', require('./routes/configs'));
app.use('/api/connections', require('./routes/connections'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    sync: syncEngine.getStatus(),
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/salesforce_jira_sync')
  .then(async () => {
    logger.info('MongoDB connected');
    if (process.env.DEMO_MODE === 'true') {
      logger.info('DEMO_MODE enabled — loading demo data');
      await seedDemoData();
    }
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

    // Start the sync scheduler
    const intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10);
    cron.schedule(`*/${intervalMinutes} * * * *`, () => {
      logger.info('Scheduled sync triggered');
      syncEngine.runSync().catch((err) => logger.error('Sync error:', err.message));
    });
    logger.info(`Auto-sync scheduled every ${intervalMinutes} minute(s)`);
  })
  .catch((err) => {
    logger.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
