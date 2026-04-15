const express = require('express');
const router = express.Router();
const salesforceService = require('../services/salesforceService');
const jiraService = require('../services/jiraService');

const DEMO = process.env.DEMO_MODE === 'true';

const DEMO_SF_STATUS = {
  connected: true,
  username: 'demo@acme-corp.com',
  orgId: '00D5g000000DEMOORG',
  instanceUrl: 'https://acme-corp.my.salesforce.com',
  apiVersion: '59.0',
};

const DEMO_JIRA_STATUS = {
  connected: true,
  email: 'demo@acme-corp.com',
  baseUrl: 'https://acme-corp.atlassian.net',
  serverVersion: '1001.0.0-SNAPSHOT',
  deploymentType: 'Cloud',
};

const DEMO_PROJECTS = [
  { id: '10001', key: 'PROJ',  name: 'Support & Bugs',       projectTypeKey: 'software', style: 'next-gen' },
  { id: '10002', key: 'SALES', name: 'Sales Pipeline',       projectTypeKey: 'business', style: 'classic' },
  { id: '10003', key: 'OPS',   name: 'Operations & DevOps',  projectTypeKey: 'software', style: 'classic' },
  { id: '10004', key: 'PLAT',  name: 'Platform Engineering', projectTypeKey: 'software', style: 'next-gen' },
];

// GET /api/connections/salesforce
router.get('/salesforce', async (req, res) => {
  if (DEMO) return res.json(DEMO_SF_STATUS);
  const status = await salesforceService.getConnectionStatus();
  res.json(status);
});

// GET /api/connections/jira
router.get('/jira', async (req, res) => {
  if (DEMO) return res.json(DEMO_JIRA_STATUS);
  const status = await jiraService.getConnectionStatus();
  res.json(status);
});

// GET /api/connections/jira/projects
router.get('/jira/projects', async (req, res) => {
  if (DEMO) return res.json(DEMO_PROJECTS);
  try {
    const projects = await jiraService.getProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connections/test-all
router.post('/test-all', async (req, res) => {
  if (DEMO) return res.json({ salesforce: DEMO_SF_STATUS, jira: DEMO_JIRA_STATUS });
  const [sf, jira] = await Promise.allSettled([
    salesforceService.getConnectionStatus(),
    jiraService.getConnectionStatus(),
  ]);
  res.json({
    salesforce: sf.status === 'fulfilled' ? sf.value : { connected: false, error: sf.reason?.message },
    jira: jira.status === 'fulfilled' ? jira.value : { connected: false, error: jira.reason?.message },
  });
});

module.exports = router;
