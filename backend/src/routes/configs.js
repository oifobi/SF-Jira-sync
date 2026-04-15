const express = require('express');
const router = express.Router();
const { SyncConfig } = require('../models');

// GET /api/configs
router.get('/', async (req, res) => {
  try {
    const configs = await SyncConfig.find().sort({ createdAt: -1 });
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/configs
router.post('/', async (req, res) => {
  try {
    const config = new SyncConfig(req.body);
    await config.save();
    res.status(201).json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/configs/:id
router.put('/:id', async (req, res) => {
  try {
    const config = await SyncConfig.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!config) return res.status(404).json({ message: 'Config not found' });
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/configs/:id
router.delete('/:id', async (req, res) => {
  try {
    await SyncConfig.findByIdAndDelete(req.params.id);
    res.json({ message: 'Config deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/configs/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  try {
    const config = await SyncConfig.findById(req.params.id);
    if (!config) return res.status(404).json({ message: 'Config not found' });
    config.isActive = !config.isActive;
    await config.save();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
