/**
 * Demo seed — populates MongoDB with realistic demo data when DEMO_MODE=true.
 * Safe to run multiple times (clears existing data first).
 */
const { SyncRecord, SyncLog, SyncConfig } = require('../models');
const logger = require('./logger');

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000);
const minsAgo  = (m) => new Date(now - m * 60 * 1000);

// ── Seed data ────────────────────────────────────────────────────────────────

const RECORDS = [
  {
    salesforceId: 'SF-CASE-00104821', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-441', jiraIssueId: '10441', jiraProjectKey: 'PROJ',
    status: 'ACTIVE', lastSyncedAt: minsAgo(3), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'High', escalated: false,
    createdInSf: hoursAgo(6),
  },
  {
    salesforceId: 'SF-CASE-00104789', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-435', jiraIssueId: '10435', jiraProjectKey: 'PROJ',
    status: 'ACTIVE', lastSyncedAt: minsAgo(8), lastSyncDirection: 'JIRA_TO_SF',
    lastKnownSfPriority: 'Critical', escalated: true,
    escalatedAt: hoursAgo(2), escalationNote: 'Case open >48h with no JIRA progress',
    createdInSf: hoursAgo(52),
  },
  {
    salesforceId: 'SF-OPP-00039201', salesforceType: 'Opportunity',
    jiraIssueKey: 'SALES-88', jiraIssueId: '20088', jiraProjectKey: 'SALES',
    status: 'ACTIVE', lastSyncedAt: minsAgo(5), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'Medium', escalated: false,
    createdInSf: hoursAgo(10),
  },
  {
    salesforceId: 'SF-CASE-00104633', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-420', jiraIssueId: '10420', jiraProjectKey: 'PROJ',
    status: 'ACTIVE', lastSyncedAt: minsAgo(12), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'P1', escalated: true,
    escalatedAt: hoursAgo(5), escalationNote: 'Case open >48h with no JIRA progress',
    createdInSf: hoursAgo(72),
  },
  {
    salesforceId: 'SF-CASE-00104500', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-410', jiraIssueId: '10410', jiraProjectKey: 'PROJ',
    status: 'ACTIVE', lastSyncedAt: minsAgo(4), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'Low', escalated: false,
    autoClosedAt: hoursAgo(1),
    createdInSf: hoursAgo(24),
  },
  {
    salesforceId: 'SF-CASE-00104388', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-399', jiraIssueId: '10399', jiraProjectKey: 'PROJ',
    status: 'ERROR', lastSyncedAt: hoursAgo(1), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'Medium', escalated: false,
    errorCount: 3, lastError: 'JIRA transition failed: status "In Progress" not found in workflow',
    createdInSf: hoursAgo(30),
  },
  {
    salesforceId: 'SF-LEAD-00021144', salesforceType: 'Lead',
    jiraIssueKey: 'SALES-72', jiraIssueId: '20072', jiraProjectKey: 'SALES',
    status: 'ACTIVE', lastSyncedAt: minsAgo(6), lastSyncDirection: 'JIRA_TO_SF',
    lastKnownSfPriority: 'High', escalated: false,
    createdInSf: hoursAgo(14),
  },
  {
    salesforceId: 'SF-CASE-00104290', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-381', jiraIssueId: '10381', jiraProjectKey: 'PROJ',
    status: 'PAUSED', lastSyncedAt: hoursAgo(3), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'Low', escalated: false,
    createdInSf: hoursAgo(48),
  },
  {
    salesforceId: 'SF-TASK-00088771', salesforceType: 'Task',
    jiraIssueKey: 'PROJ-375', jiraIssueId: '10375', jiraProjectKey: 'PROJ',
    status: 'ACTIVE', lastSyncedAt: minsAgo(2), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'High', escalated: false,
    createdInSf: hoursAgo(8),
  },
  {
    salesforceId: 'SF-OPP-00038900', salesforceType: 'Opportunity',
    jiraIssueKey: 'SALES-65', jiraIssueId: '20065', jiraProjectKey: 'SALES',
    status: 'ACTIVE', lastSyncedAt: minsAgo(10), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'Critical', escalated: false,
    autoClosedAt: hoursAgo(2),
    createdInSf: hoursAgo(18),
  },
  {
    salesforceId: 'SF-CASE-00104100', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-360', jiraIssueId: '10360', jiraProjectKey: 'PROJ',
    status: 'ACTIVE', lastSyncedAt: minsAgo(7), lastSyncDirection: 'JIRA_TO_SF',
    lastKnownSfPriority: 'Medium', escalated: false,
    createdInSf: hoursAgo(12),
  },
  {
    salesforceId: 'SF-CASE-00103981', salesforceType: 'Case',
    jiraIssueKey: 'PROJ-348', jiraIssueId: '10348', jiraProjectKey: 'PROJ',
    status: 'DELETED', lastSyncedAt: hoursAgo(6), lastSyncDirection: 'SF_TO_JIRA',
    lastKnownSfPriority: 'Low', escalated: false,
    createdInSf: hoursAgo(96),
  },
];

function makeLog(minsAgoVal, direction, status, processed, succeeded, failed, durationMs) {
  const rules = [
    { rule: 'STATUS_SYNC',    fired: Math.max(0, succeeded - 1), succeeded: Math.max(0, succeeded - 1), failed: 0 },
    { rule: 'PRIORITY_SYNC',  fired: Math.floor(succeeded / 2),  succeeded: Math.floor(succeeded / 2),  failed: 0 },
    { rule: 'COMMENT_MIRROR', fired: Math.floor(succeeded / 3),  succeeded: Math.floor(succeeded / 3),  failed: 0 },
    { rule: 'AUTO_CLOSE',     fired: Math.floor(succeeded / 6),  succeeded: Math.floor(succeeded / 6),  failed: 0 },
    { rule: 'ESCALATION',     fired: Math.floor(succeeded / 8),  succeeded: Math.floor(succeeded / 8),  failed: failed > 0 ? 1 : 0 },
  ];
  return {
    timestamp: minsAgo(minsAgoVal),
    direction,
    status,
    recordsProcessed: processed,
    recordsSucceeded: succeeded,
    recordsFailed: failed,
    duration: durationMs,
    ruleResults: rules,
    errors: failed > 0 ? [{ message: 'JIRA transition failed: workflow guard rejected', recordId: 'SF-CASE-00104388', source: 'jiraService' }] : [],
  };
}

const LOGS = [
  makeLog(2,   'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1842),
  makeLog(7,   'BIDIRECTIONAL', 'SUCCESS', 11, 10, 1, 2103),
  makeLog(12,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1763),
  makeLog(17,  'SF_TO_JIRA',    'SUCCESS', 8,  8,  0, 1204),
  makeLog(22,  'BIDIRECTIONAL', 'PARTIAL', 11, 9,  2, 2547),
  makeLog(27,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1891),
  makeLog(32,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1654),
  makeLog(37,  'JIRA_TO_SF',    'SUCCESS', 6,  6,  0, 930),
  makeLog(42,  'BIDIRECTIONAL', 'SUCCESS', 11, 10, 1, 2010),
  makeLog(47,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1780),
  makeLog(52,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1720),
  makeLog(57,  'SF_TO_JIRA',    'SUCCESS', 9,  9,  0, 1340),
  makeLog(62,  'BIDIRECTIONAL', 'PARTIAL', 11, 8,  3, 2890),
  makeLog(67,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1810),
  makeLog(72,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1690),
  makeLog(77,  'JIRA_TO_SF',    'SUCCESS', 5,  5,  0, 870),
  makeLog(82,  'BIDIRECTIONAL', 'SUCCESS', 11, 10, 1, 2120),
  makeLog(87,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1740),
  makeLog(92,  'BIDIRECTIONAL', 'SUCCESS', 11, 11, 0, 1660),
  makeLog(97,  'SF_TO_JIRA',    'FAILED',  11, 0,  11, 3100),
];

const CONFIGS = [
  {
    name: 'Support Cases → PROJ',
    salesforceObjectType: 'Case',
    jiraProjectKey: 'PROJ',
    jiraIssueType: 'Bug',
    syncDirection: 'BIDIRECTIONAL',
    syncIntervalMinutes: 5,
    isActive: true,
    fieldMappings: [
      { salesforceField: 'Subject',     jiraField: 'summary' },
      { salesforceField: 'Description', jiraField: 'description' },
      { salesforceField: 'Priority',    jiraField: 'priority' },
    ],
    statusMappings: [
      { salesforceStatus: 'New',         jiraStatus: 'To Do' },
      { salesforceStatus: 'In Progress', jiraStatus: 'In Progress' },
      { salesforceStatus: 'Closed',      jiraStatus: 'Done' },
    ],
    rules: {
      statusSync: true, prioritySync: true, commentMirror: true,
      autoClose: true, escalation: true, escalationThresholdHours: 48,
    },
  },
  {
    name: 'Opportunities → SALES',
    salesforceObjectType: 'Opportunity',
    jiraProjectKey: 'SALES',
    jiraIssueType: 'Task',
    syncDirection: 'SF_TO_JIRA',
    syncIntervalMinutes: 10,
    isActive: true,
    fieldMappings: [
      { salesforceField: 'Name',         jiraField: 'summary' },
      { salesforceField: 'Description',  jiraField: 'description' },
    ],
    statusMappings: [
      { salesforceStatus: 'Prospecting', jiraStatus: 'To Do' },
      { salesforceStatus: 'Closed Won',  jiraStatus: 'Done' },
    ],
    rules: {
      statusSync: true, prioritySync: false, commentMirror: false,
      autoClose: false, escalation: false, escalationThresholdHours: 72,
    },
  },
];

// ── Main seed function ────────────────────────────────────────────────────────

async function seedDemoData() {
  try {
    // Only seed if database is empty
    const existingRecords = await SyncRecord.countDocuments();
    if (existingRecords > 0) {
      logger.info(`Demo mode: database already has ${existingRecords} records, skipping seed`);
      return;
    }

    logger.info('Demo mode: seeding database with demo data…');

    await Promise.all([
      SyncRecord.insertMany(RECORDS),
      SyncLog.insertMany(LOGS),
      SyncConfig.insertMany(CONFIGS),
    ]);

    logger.info(`Demo mode: seeded ${RECORDS.length} records, ${LOGS.length} logs, ${CONFIGS.length} configs`);
  } catch (err) {
    logger.error('Demo seed failed:', err.message);
  }
}

module.exports = { seedDemoData };
