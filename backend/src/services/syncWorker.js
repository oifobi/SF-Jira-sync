const cron = require('node-cron');
const mongoose = require('mongoose');
const syncEngine = require('./syncEngine');
const logger = require('../utils/logger');
require('dotenv').config();

async function startWorker() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/salesforce_jira_sync');
    logger.info('Sync worker connected to MongoDB');

    const intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10);
    const cronExpression = `*/${intervalMinutes} * * * *`;

    logger.info(`Starting sync worker — interval: every ${intervalMinutes} minute(s)`);

    // Run immediately on start
    await syncEngine.runSync();

    // Schedule recurring
    cron.schedule(cronExpression, async () => {
      logger.info('Scheduled sync triggered');
      try {
        const result = await syncEngine.runSync();
        logger.info('Sync completed:', JSON.stringify(result.stats || {}));
      } catch (err) {
        logger.error('Scheduled sync error:', err.message);
      }
    });

    logger.info('Sync worker is running');
  } catch (err) {
    logger.error('Worker startup failed:', err.message);
    process.exit(1);
  }
}

startWorker();
