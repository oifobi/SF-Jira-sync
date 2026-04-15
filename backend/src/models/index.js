const mongoose = require('mongoose');

// ── Sync Log ────────────────────────────────────────────────────────────────
const syncLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  direction: {
    type: String,
    enum: ['SF_TO_JIRA', 'JIRA_TO_SF', 'BIDIRECTIONAL', 'RULES'],
    required: true,
  },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'PARTIAL'], required: true },
  recordsProcessed: { type: Number, default: 0 },
  recordsSucceeded: { type: Number, default: 0 },
  recordsFailed:    { type: Number, default: 0 },
  errors: [{ message: String, recordId: String, source: String }],
  duration: { type: Number }, // ms
  ruleResults: [
    {
      rule:      String,  // 'STATUS_SYNC' | 'PRIORITY_SYNC' | 'COMMENT_MIRROR' | 'AUTO_CLOSE' | 'ESCALATION'
      fired:     Number,
      succeeded: Number,
      failed:    Number,
    },
  ],
});

// ── Sync Record ──────────────────────────────────────────────────────────────
const syncRecordSchema = new mongoose.Schema(
  {
    salesforceId:   { type: String, required: true, index: true },
    salesforceType: { type: String, required: true, enum: ['Case', 'Opportunity', 'Lead', 'Task'] },
    jiraIssueKey:   { type: String, required: true, index: true },
    jiraIssueId:    { type: String },
    jiraProjectKey: { type: String },

    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'ERROR', 'DELETED'],
      default: 'ACTIVE',
    },

    lastSyncedAt:      { type: Date },
    lastSyncDirection: { type: String, enum: ['SF_TO_JIRA', 'JIRA_TO_SF'] },
    syncHash:          { type: String },

    // Comment mirror — IDs we've already synced to avoid duplicates
    mirroredSfCommentIds:   [{ type: String }],
    mirroredJiraCommentIds: [{ type: String }],

    // Escalation state
    escalated:      { type: Boolean, default: false },
    escalatedAt:    { type: Date },
    escalationNote: { type: String },
    createdInSf:    { type: Date },  // cached SF CreatedDate for age checks

    // Priority tracking
    lastKnownSfPriority: { type: String },

    // Auto-close tracking
    autoClosedAt: { type: Date },

    fieldMappings: [
      {
        salesforceField: String,
        jiraField:       String,
        lastValue:       mongoose.Schema.Types.Mixed,
      },
    ],
    metadata: {
      salesforceObject: mongoose.Schema.Types.Mixed,
      jiraIssue:        mongoose.Schema.Types.Mixed,
    },

    errorCount: { type: Number, default: 0 },
    lastError:  { type: String },
  },
  { timestamps: true }
);

// ── Sync Config ──────────────────────────────────────────────────────────────
const configSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },

    salesforceObjectType: {
      type: String,
      enum: ['Case', 'Opportunity', 'Lead', 'Task'],
      required: true,
    },
    jiraProjectKey:  { type: String, required: true },
    jiraIssueType:   { type: String, default: 'Task' },

    syncDirection: {
      type: String,
      enum: ['SF_TO_JIRA', 'JIRA_TO_SF', 'BIDIRECTIONAL'],
      default: 'BIDIRECTIONAL',
    },
    syncIntervalMinutes: { type: Number, default: 5 },
    isActive:            { type: Boolean, default: true },

    fieldMappings: [
      {
        salesforceField: { type: String, required: true },
        jiraField:       { type: String, required: true },
        transform:       { type: String },
      },
    ],
    filters: {
      salesforce: { type: String },
      jira:       { type: String },
    },
    statusMappings: [
      { salesforceStatus: String, jiraStatus: String },
    ],

    // Per-config rule toggles
    rules: {
      statusSync:               { type: Boolean, default: true },
      prioritySync:             { type: Boolean, default: true },
      commentMirror:            { type: Boolean, default: true },
      autoClose:                { type: Boolean, default: true },
      escalation:               { type: Boolean, default: true },
      escalationThresholdHours: { type: Number,  default: 48  },
    },
  },
  { timestamps: true }
);

const SyncRecord = mongoose.model('SyncRecord', syncRecordSchema);
const SyncLog    = mongoose.model('SyncLog',    syncLogSchema);
const SyncConfig = mongoose.model('SyncConfig', configSchema);

module.exports = { SyncRecord, SyncLog, SyncConfig };
