const express = require('express');
const router = express.Router();
const syncEngine = require('../services/syncEngine');
const { SyncRecord, SyncLog, SyncConfig } = require('../models');

// GET /api/sync/status
router.get('/status', (req, res) => {
  res.json(syncEngine.getStatus());
});

// POST /api/sync/trigger
router.post('/trigger', async (req, res) => {
  try {
    if (syncEngine.running) {
      return res.status(409).json({ message: 'Sync already in progress' });
    }
    syncEngine.runSync().catch((err) => console.error('Sync error:', err.message));
    res.json({ message: 'Sync triggered', status: 'running' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/logs
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const logs = await SyncLog.find()
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    const total = await SyncLog.countDocuments();
    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/records
router.get('/records', async (req, res) => {
  try {
    const { status, limit = 50, page = 1, search, escalated } = req.query;
    const query = {};
    if (status) query.status = status;
    if (escalated === 'true') query.escalated = true;
    if (search) {
      query.$or = [
        { salesforceId:  { $regex: search, $options: 'i' } },
        { jiraIssueKey:  { $regex: search, $options: 'i' } },
      ];
    }
    const records = await SyncRecord.find(query)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    const total = await SyncRecord.countDocuments(query);
    res.json({ records, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/records/:id
router.get('/records/:id', async (req, res) => {
  try {
    const record = await SyncRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sync/records/:id
router.delete('/records/:id', async (req, res) => {
  try {
    await SyncRecord.findByIdAndUpdate(req.params.id, { status: 'DELETED' });
    res.json({ message: 'Sync record unlinked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/stats
router.get('/stats', async (req, res) => {
  try {
    const [totalRecords, activeRecords, errorRecords, escalatedRecords, autoClosedRecords, recentLogs] =
      await Promise.all([
        SyncRecord.countDocuments(),
        SyncRecord.countDocuments({ status: 'ACTIVE' }),
        SyncRecord.countDocuments({ status: 'ERROR' }),
        SyncRecord.countDocuments({ escalated: true }),
        SyncRecord.countDocuments({ autoClosedAt: { $exists: true } }),
        SyncLog.find().sort({ timestamp: -1 }).limit(20),
      ]);

    const totalSynced = recentLogs.reduce((a, l) => a + l.recordsSucceeded, 0);
    const totalFailed = recentLogs.reduce((a, l) => a + l.recordsFailed, 0);

    // Aggregate rule stats across recent logs
    const ruleAgg = {};
    for (const log of recentLogs) {
      for (const r of log.ruleResults || []) {
        if (!ruleAgg[r.rule]) ruleAgg[r.rule] = { fired: 0, succeeded: 0, failed: 0 };
        ruleAgg[r.rule].fired     += r.fired     || 0;
        ruleAgg[r.rule].succeeded += r.succeeded || 0;
        ruleAgg[r.rule].failed    += r.failed    || 0;
      }
    }

    res.json({
      records: {
        total:      totalRecords,
        active:     activeRecords,
        error:      errorRecords,
        escalated:  escalatedRecords,
        autoClosed: autoClosedRecords,
      },
      recentActivity: { totalSynced, totalFailed },
      ruleStats:   ruleAgg,
      engineStats: syncEngine.getStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/rules — static rule definitions
router.get('/rules', (req, res) => {
  res.json(syncEngine.getRuleDefinitions());
});

// GET /api/sync/escalated — shortcut for escalated records
router.get('/escalated', async (req, res) => {
  try {
    const records = await SyncRecord.find({ escalated: true })
      .sort({ escalatedAt: -1 })
      .limit(100);
    res.json({ records, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
