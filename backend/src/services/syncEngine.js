/**
 * SyncEngine — core bidirectional sync agent
 *
 * Rules applied on every run (per SyncRecord):
 *  1. STATUS_SYNC     — SF status → JIRA transition (and JIRA Done → SF)
 *  2. PRIORITY_SYNC   — SF P1/Critical/Urgent → JIRA Highest
 *  3. COMMENT_MIRROR  — New comments synced both ways (1h window, no duplicates)
 *  4. AUTO_CLOSE      — SF case set to Closed when JIRA transitions to Done
 *  5. ESCALATION      — Cases open >N hours with no JIRA progress get flagged
 */

const crypto = require('crypto');
const salesforceService = require('./salesforceService');
const jiraService       = require('./jiraService');
const { SyncRecord, SyncLog, SyncConfig } = require('../models');
const logger = require('../utils/logger');

// ── Constants ──────────────────────────────────────────────────────────────
const PRIORITY_SF_TO_JIRA = {
  Critical: 'Highest',
  Urgent:   'Highest',
  High:     'High',
  Medium:   'Medium',
  Low:      'Low',
};

const PRIORITY_JIRA_TO_SF = Object.fromEntries(
  Object.entries(PRIORITY_SF_TO_JIRA).map(([sf, jira]) => [jira, sf])
);

const CASE_COUNT_PRIORITY_MAP = {
  P0: 'Highest',
  P1: 'High',
};

const DEFAULT_FIELD_MAPPINGS = {
  Case: [
    { salesforceField: 'Subject',     jiraField: 'summary'     },
    { salesforceField: 'Description', jiraField: 'description' },
    { salesforceField: 'Priority',    jiraField: 'priority'    },
    { salesforceField: 'Status',      jiraField: '_status'     },
  ],
  Opportunity: [
    { salesforceField: 'Name',        jiraField: 'summary'  },
    { salesforceField: 'Description', jiraField: 'description' },
    { salesforceField: 'StageName',   jiraField: '_status'  },
  ],
  Lead: [
    { salesforceField: 'LastName',    jiraField: 'summary'  },
    { salesforceField: 'Description', jiraField: 'description' },
    { salesforceField: 'Status',      jiraField: '_status'  },
  ],
  Task: [
    { salesforceField: 'Subject',     jiraField: 'summary'     },
    { salesforceField: 'Description', jiraField: 'description' },
    { salesforceField: 'Priority',    jiraField: 'priority'    },
    { salesforceField: 'Status',      jiraField: '_status'     },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function hashObject(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex');
}

function makeRuleStat() {
  return { fired: 0, succeeded: 0, failed: 0 };
}

function extractJiraPlainText(adfBody) {
  try {
    return (adfBody?.content || [])
      .flatMap((block) => block.content || [])
      .filter((n) => n.type === 'text')
      .map((n) => n.text)
      .join('');
  } catch {
    return '';
  }
}

// ── SyncEngine ─────────────────────────────────────────────────────────────
class SyncEngine {
  constructor() {
    this.running      = false;
    this.lastSyncTime = null;
    this.stats = {
      totalSyncs:     0,
      successfulSyncs: 0,
      failedSyncs:    0,
      recordsSynced:  0,
    };
  }

  // ── Field mapping helpers ────────────────────────────────────────────────

  mapSalesforceToJira(sfRecord, objectType, customMappings = []) {
    const mappings = customMappings.length > 0
      ? customMappings
      : DEFAULT_FIELD_MAPPINGS[objectType] || [];

    const jiraData = {
      extraFields: {},
      labels: ['salesforce-sync', `sf-${objectType.toLowerCase()}`],
    };

    for (const m of mappings) {
      const value = sfRecord[m.salesforceField];
      if (value == null) continue;
      if (m.jiraField === 'summary')     jiraData.summary = String(value);
      else if (m.jiraField === 'description') jiraData.description = String(value);
      else if (m.jiraField === 'priority')    jiraData.priority = PRIORITY_SF_TO_JIRA[value] || 'Medium';
      else if (m.jiraField === '_status')     jiraData._statusValue = value;
      else jiraData.extraFields[m.jiraField] = value;
    }

    const sfFooter = `\n\n---\nSalesforce ${objectType} ID: ${sfRecord.Id}`;
    jiraData.description = (jiraData.description || '') + sfFooter;
    return jiraData;
  }

  mapJiraToSalesforce(jiraIssue, objectType, customMappings = []) {
    const mappings = customMappings.length > 0
      ? customMappings
      : DEFAULT_FIELD_MAPPINGS[objectType] || [];
    const sfData = {};
    const fields = jiraIssue.fields;

    for (const m of mappings) {
      if (m.jiraField === 'summary') {
        sfData[m.salesforceField] = fields.summary;
      } else if (m.jiraField === 'description') {
        const raw = extractJiraPlainText(fields.description);
        sfData[m.salesforceField] = raw.replace(/\n\n---\nSalesforce .* ID:.*$/s, '').trim();
      } else if (m.jiraField === 'priority') {
        const p = fields.priority?.name;
        if (p) sfData[m.salesforceField] = PRIORITY_JIRA_TO_SF[p] || 'Medium';
      }
      // _status handled per-rule
    }
    return sfData;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 1 — STATUS SYNC
  // SF status → JIRA transition; JIRA status → SF status update.
  // ══════════════════════════════════════════════════════════════════════════
  async ruleStatusSync(syncRecord, sfRecord, jiraIssue, config, ruleStats) {
    const rules = config.rules || {};
    if (rules.statusSync === false) return;

    const statusMappings = config.statusMappings || [];
    if (!statusMappings.length) return;

    ruleStats.fired++;

    try {
      const sfStatus   = sfRecord.Status || sfRecord.StageName;
      const jiraStatus = jiraIssue.fields.status?.name;

      // SF → JIRA direction
      if (sfStatus) {
        const mapping = statusMappings.find((m) => m.salesforceStatus === sfStatus);
        if (mapping && jiraStatus?.toLowerCase() !== mapping.jiraStatus.toLowerCase()) {
          const transitioned = await jiraService.transitionIssue(
            syncRecord.jiraIssueKey,
            mapping.jiraStatus
          );
          if (transitioned) {
            logger.info(`[STATUS_SYNC] ${syncRecord.jiraIssueKey}: ${jiraStatus} → ${mapping.jiraStatus}`);
          }
        }
      }

      // JIRA → SF direction (reverse mapping)
      if (jiraStatus && (config.syncDirection === 'JIRA_TO_SF' || config.syncDirection === 'BIDIRECTIONAL')) {
        const reverseMapping = statusMappings.find(
          (m) => m.jiraStatus?.toLowerCase() === jiraStatus.toLowerCase()
        );
        if (reverseMapping && sfStatus !== reverseMapping.salesforceStatus) {
          const sfField = sfRecord.StageName !== undefined ? 'StageName' : 'Status';
          await salesforceService.updateRecord(
            config.salesforceObjectType,
            syncRecord.salesforceId,
            { [sfField]: reverseMapping.salesforceStatus }
          );
          logger.info(`[STATUS_SYNC] SF ${syncRecord.salesforceId}: ${sfStatus} → ${reverseMapping.salesforceStatus}`);
        }
      }

      ruleStats.succeeded++;
    } catch (err) {
      ruleStats.failed++;
      logger.error(`[STATUS_SYNC] error for ${syncRecord.salesforceId}:`, err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2 — PRIORITY SYNC
  // SF P1/Critical/Urgent → JIRA Highest (and reverse).
  // ══════════════════════════════════════════════════════════════════════════
  async rulePrioritySync(syncRecord, sfRecord, jiraIssue, config, ruleStats) {
    const rules = config.rules || {};
    if (rules.prioritySync === false) return;

    const sfPriority   = sfRecord.Priority;
    const jiraPriority = jiraIssue.fields.priority?.name;
    if (!sfPriority) return;

    const expectedJira = PRIORITY_SF_TO_JIRA[sfPriority] || 'Medium';
    const lastKnown    = syncRecord.lastKnownSfPriority;

    // Only act if SF priority changed since last sync
    if (lastKnown === sfPriority && jiraPriority === expectedJira) return;

    ruleStats.fired++;
    try {
      // Update JIRA priority
      if (jiraPriority !== expectedJira) {
        await jiraService.updateIssue(syncRecord.jiraIssueKey, { priority: expectedJira });
        logger.info(`[PRIORITY_SYNC] ${syncRecord.jiraIssueKey}: priority → ${expectedJira} (SF: ${sfPriority})`);

        // If escalated to Highest, leave a comment on JIRA
        if (expectedJira === 'Highest') {
          await jiraService.addComment(
            syncRecord.jiraIssueKey,
            `🚨 Priority escalated to Highest — Salesforce case priority is "${sfPriority}".`
          );
        }
      }

      // Also sync reverse: JIRA → SF if JIRA priority changed externally
      if (
        jiraPriority &&
        jiraPriority !== expectedJira &&
        (config.syncDirection === 'JIRA_TO_SF' || config.syncDirection === 'BIDIRECTIONAL')
      ) {
        const sfEquiv = PRIORITY_JIRA_TO_SF[jiraPriority];
        if (sfEquiv && sfEquiv !== sfPriority) {
          await salesforceService.updateRecord(
            config.salesforceObjectType,
            syncRecord.salesforceId,
            { Priority: sfEquiv }
          );
          logger.info(`[PRIORITY_SYNC] SF ${syncRecord.salesforceId}: Priority → ${sfEquiv}`);
        }
      }

      syncRecord.lastKnownSfPriority = sfPriority;
      ruleStats.succeeded++;
    } catch (err) {
      ruleStats.failed++;
      logger.error(`[PRIORITY_SYNC] error for ${syncRecord.salesforceId}:`, err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3 — COMMENT MIRROR
  // New SF CaseComments → JIRA comment; new JIRA comments → SF CaseComment.
  // Uses mirroredSfCommentIds / mirroredJiraCommentIds to avoid duplicates.
  // ══════════════════════════════════════════════════════════════════════════
  async ruleCommentMirror(syncRecord, config, ruleStats) {
    const rules = config.rules || {};
    if (rules.commentMirror === false) return;
    if (config.salesforceObjectType !== 'Case') return; // CaseComment is Case-only

    const windowDate = new Date(Date.now() - 60 * 60 * 1000); // 1-hour window

    ruleStats.fired++;
    let ok = true;

    try {
      // ── SF → JIRA comments ─────────────────────────────────────────────
      const sfComments = await salesforceService.getCaseComments(
        syncRecord.salesforceId,
        windowDate
      );

      for (const c of sfComments) {
        if (syncRecord.mirroredSfCommentIds.includes(c.Id)) continue;

        const body = `[Salesforce] ${c.CreatorName || 'Agent'}: ${c.CommentBody}`;
        await jiraService.addComment(syncRecord.jiraIssueKey, body);

        syncRecord.mirroredSfCommentIds.push(c.Id);
        logger.info(`[COMMENT_MIRROR] SF comment ${c.Id} → ${syncRecord.jiraIssueKey}`);
      }

      // ── JIRA → SF comments ─────────────────────────────────────────────
      if (config.syncDirection === 'BIDIRECTIONAL' || config.syncDirection === 'JIRA_TO_SF') {
        const jiraComments = await jiraService.getIssueComments(
          syncRecord.jiraIssueKey,
          windowDate
        );

        for (const c of jiraComments) {
          if (syncRecord.mirroredJiraCommentIds.includes(c.id)) continue;

          // Skip comments we ourselves posted (salesforce-sync attribution)
          const text = extractJiraPlainText(c.body);
          if (text.startsWith('[Salesforce]') || text.startsWith('🔗') || text.startsWith('🚨') || text.startsWith('⚠️')) continue;

          const displayName = c.author?.displayName || 'JIRA User';
          const body = `[JIRA - ${syncRecord.jiraIssueKey}] ${displayName}: ${text}`;
          await salesforceService.addCaseComment(syncRecord.salesforceId, body);

          syncRecord.mirroredJiraCommentIds.push(c.id);
          logger.info(`[COMMENT_MIRROR] JIRA comment ${c.id} → SF ${syncRecord.salesforceId}`);
        }
      }

      ruleStats.succeeded++;
    } catch (err) {
      ok = false;
      ruleStats.failed++;
      logger.error(`[COMMENT_MIRROR] error for ${syncRecord.salesforceId}:`, err.message);
    }

    return ok;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 4 — AUTO-CLOSE
  // When JIRA issue status is "Done", automatically close the SF case.
  // ══════════════════════════════════════════════════════════════════════════
  async ruleAutoClose(syncRecord, sfRecord, jiraIssue, config, ruleStats) {
    const rules = config.rules || {};
    if (rules.autoClose === false) return;
    if (syncRecord.autoClosedAt) return; // already closed, don't re-fire

    const jiraStatus = jiraIssue.fields.status?.name?.toLowerCase();
    const sfStatus   = sfRecord.Status;

    if (jiraStatus !== 'done') return;
    if (sfStatus === 'Closed') return; // already closed

    ruleStats.fired++;
    try {
      await salesforceService.updateRecord(
        config.salesforceObjectType,
        syncRecord.salesforceId,
        { Status: 'Closed' }
      );

      // Mirror a comment back to JIRA
      await jiraService.addComment(
        syncRecord.jiraIssueKey,
        `✅ Salesforce ${config.salesforceObjectType} ${syncRecord.salesforceId} automatically closed because this JIRA issue moved to Done.`
      );

      if (config.salesforceObjectType === 'Case') {
        await salesforceService.addCaseComment(
          syncRecord.salesforceId,
          `[Auto-closed by SyncAgent] JIRA issue ${syncRecord.jiraIssueKey} was marked Done.`
        );
      }

      syncRecord.autoClosedAt = new Date();
      logger.info(`[AUTO_CLOSE] SF ${syncRecord.salesforceId} closed ← JIRA ${syncRecord.jiraIssueKey} Done`);
      ruleStats.succeeded++;
    } catch (err) {
      ruleStats.failed++;
      logger.error(`[AUTO_CLOSE] error for ${syncRecord.salesforceId}:`, err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 5 — ESCALATION
  // Flag Cases open > threshold hours with no JIRA progress (still To Do / Open).
  // Posts a comment on JIRA and a CaseComment in SF; sets syncRecord.escalated.
  // ══════════════════════════════════════════════════════════════════════════
  async ruleEscalation(syncRecord, sfRecord, jiraIssue, config, ruleStats) {
    const rules = config.rules || {};
    if (rules.escalation === false) return;
    if (syncRecord.escalated) return; // already escalated, don't spam
    if (sfRecord.Status === 'Closed') return;

    const thresholdHours = rules.escalationThresholdHours || 48;
    const createdAt = syncRecord.createdInSf
      ? new Date(syncRecord.createdInSf)
      : sfRecord.CreatedDate
        ? new Date(sfRecord.CreatedDate)
        : null;

    if (!createdAt) return;

    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < thresholdHours) return;

    // Check JIRA progress — escalate only if still in an "initial" status
    const jiraStatus = jiraIssue.fields.status?.name?.toLowerCase() || '';
    const noProgress = ['to do', 'open', 'backlog', 'new'].some((s) => jiraStatus.includes(s));
    if (!noProgress) return;

    ruleStats.fired++;
    try {
      const ageRounded = Math.round(ageHours);
      const note =
        `⚠️ Escalation: Salesforce ${config.salesforceObjectType} ${syncRecord.salesforceId} ` +
        `has been open for ${ageRounded}h with no JIRA progress (status: "${jiraIssue.fields.status?.name}"). ` +
        `Immediate attention required.`;

      await jiraService.addComment(syncRecord.jiraIssueKey, note);

      if (config.salesforceObjectType === 'Case') {
        await salesforceService.addCaseComment(
          syncRecord.salesforceId,
          `[SyncAgent Escalation] JIRA issue ${syncRecord.jiraIssueKey} has shown no progress after ${ageRounded}h. Escalation flagged.`
        );
      }

      // Bump JIRA priority to Highest if not already
      if (jiraIssue.fields.priority?.name !== 'Highest') {
        await jiraService.updateIssue(syncRecord.jiraIssueKey, { priority: 'Highest' });
      }

      syncRecord.escalated      = true;
      syncRecord.escalatedAt    = new Date();
      syncRecord.escalationNote = note;

      logger.warn(`[ESCALATION] ${syncRecord.salesforceId} / ${syncRecord.jiraIssueKey} — ${ageRounded}h open, no progress`);
      ruleStats.succeeded++;
    } catch (err) {
      ruleStats.failed++;
      logger.error(`[ESCALATION] error for ${syncRecord.salesforceId}:`, err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 6 — CASE COUNT ESCALATION
  // When active cases in config reach threshold, auto-bump JIRA priority to P0/P1.
  // ══════════════════════════════════════════════════════════════════════════
  async ruleCaseCountEscalation(config, syncRecord, activeCount, ruleStats) {
    const rules = config.rules || {};
    if (rules.caseCountEscalation === false) return;

    const threshold = rules.caseCountThreshold ?? 10;
    const priorityKey = rules.caseCountPriority ?? 'P1';
    const jiraPriority = CASE_COUNT_PRIORITY_MAP[priorityKey] ?? 'High';

    if (activeCount < threshold) return;

    ruleStats.fired++;
    try {
      // Fetch current JIRA issue to check existing priority
      const jiraIssue = await jiraService.getIssueByKey(syncRecord.jiraIssueKey);
      const currentPriority = jiraIssue.fields.priority?.name;

      // Only update if priority differs
      if (currentPriority === jiraPriority) {
        logger.info(`[CASE_COUNT_ESCALATION] ${syncRecord.jiraIssueKey}: already at ${jiraPriority}`);
        return;
      }

      await jiraService.updateIssue(syncRecord.jiraIssueKey, { priority: jiraPriority });
      await jiraService.addComment(
        syncRecord.jiraIssueKey,
        `⚡ Priority auto-escalated to ${priorityKey} (${jiraPriority}) — config has reached ${activeCount} active cases (threshold: ${threshold}).`
      );

      logger.info(`[CASE_COUNT_ESCALATION] ${syncRecord.jiraIssueKey}: priority → ${jiraPriority} (${activeCount}/${threshold} cases)`);
      ruleStats.succeeded++;
    } catch (err) {
      ruleStats.failed++;
      logger.error(`[CASE_COUNT_ESCALATION] error for ${syncRecord.jiraIssueKey}:`, err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CORE SYNC PASSES
  // ══════════════════════════════════════════════════════════════════════════

  async syncSFtoJira(config) {
    const startTime = Date.now();
    const logEntry = {
      direction: 'SF_TO_JIRA',
      status: 'SUCCESS',
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      errors: [],
      ruleResults: [],
    };

    const ruleStats = {
      STATUS_SYNC:             makeRuleStat(),
      PRIORITY_SYNC:           makeRuleStat(),
      COMMENT_MIRROR:          makeRuleStat(),
      AUTO_CLOSE:              makeRuleStat(),
      ESCALATION:              makeRuleStat(),
      CASE_COUNT_ESCALATION:   makeRuleStat(),
    };

    try {
      const sinceDate = this.lastSyncTime || new Date(Date.now() - 60 * 60 * 1000);
      const sfRecords = await salesforceService.getModifiedRecords(
        config.salesforceObjectType,
        sinceDate,
        config.filters?.salesforce
      );

      logEntry.recordsProcessed = sfRecords.length;

      // Count active records for case count escalation rule
      const activeCount = await SyncRecord.countDocuments({ configId: config._id, status: 'ACTIVE' });

      for (const record of sfRecords) {
        try {
          const jiraData = this.mapSalesforceToJira(
            record, config.salesforceObjectType, config.fieldMappings
          );

          let syncRecord = await SyncRecord.findOne({ salesforceId: record.Id });

          if (!syncRecord) {
            // ── Create new JIRA issue ───────────────────────────────────
            const jiraIssue = await jiraService.createIssue(
              config.jiraProjectKey, config.jiraIssueType, jiraData
            );
            syncRecord = new SyncRecord({
              salesforceId:   record.Id,
              salesforceType: config.salesforceObjectType,
              jiraIssueKey:   jiraIssue.key,
              jiraIssueId:    jiraIssue.id,
              jiraProjectKey: config.jiraProjectKey,
              lastSyncedAt:   new Date(),
              lastSyncDirection: 'SF_TO_JIRA',
              syncHash:       hashObject(record),
              createdInSf:    record.CreatedDate ? new Date(record.CreatedDate) : new Date(),
              lastKnownSfPriority: record.Priority || null,
              metadata:       { salesforceObject: record },
            });

            await jiraService.addComment(
              jiraIssue.key,
              `🔗 Linked to Salesforce ${config.salesforceObjectType} ID: ${record.Id}`
            );
          } else {
            // ── Update existing pair ────────────────────────────────────
            const currentHash = hashObject(record);
            if (syncRecord.syncHash !== currentHash) {
              await jiraService.updateIssue(syncRecord.jiraIssueKey, jiraData);
              syncRecord.syncHash   = currentHash;
              syncRecord.lastSyncedAt = new Date();
              syncRecord.lastSyncDirection = 'SF_TO_JIRA';
              syncRecord.metadata.salesforceObject = record;
              if (record.CreatedDate && !syncRecord.createdInSf) {
                syncRecord.createdInSf = new Date(record.CreatedDate);
              }
            }

            // ── Fetch live JIRA issue for rules ────────────────────────
            let jiraIssue;
            try {
              jiraIssue = await jiraService.getIssueByKey(syncRecord.jiraIssueKey);
            } catch {
              // If JIRA fetch fails, skip rules for this record
              await syncRecord.save();
              logEntry.recordsSucceeded++;
              continue;
            }

            // ── Apply all 5 rules ──────────────────────────────────────
            await this.ruleStatusSync(
              syncRecord, record, jiraIssue, config, ruleStats.STATUS_SYNC
            );
            await this.rulePrioritySync(
              syncRecord, record, jiraIssue, config, ruleStats.PRIORITY_SYNC
            );
            await this.ruleCommentMirror(
              syncRecord, config, ruleStats.COMMENT_MIRROR
            );
            await this.ruleAutoClose(
              syncRecord, record, jiraIssue, config, ruleStats.AUTO_CLOSE
            );
            await this.ruleEscalation(
              syncRecord, record, jiraIssue, config, ruleStats.ESCALATION
            );
            await this.ruleCaseCountEscalation(
              config, syncRecord, activeCount, ruleStats.CASE_COUNT_ESCALATION
            );
          }

          await syncRecord.save();
          logEntry.recordsSucceeded++;
        } catch (err) {
          logEntry.recordsFailed++;
          logEntry.errors.push({ message: err.message, recordId: record.Id, source: 'SF_TO_JIRA' });
          logger.error(`Failed to sync SF record ${record.Id}:`, err.message);
        }
      }
    } catch (err) {
      logEntry.status = 'FAILED';
      logEntry.errors.push({ message: err.message, source: 'SF_TO_JIRA' });
      logger.error('SF→JIRA sync batch failed:', err.message);
    }

    logEntry.duration = Date.now() - startTime;
    logEntry.ruleResults = Object.entries(ruleStats).map(([rule, s]) => ({ rule, ...s }));
    if (logEntry.recordsFailed > 0 && logEntry.recordsSucceeded > 0)  logEntry.status = 'PARTIAL';
    else if (logEntry.recordsFailed > 0 && logEntry.recordsSucceeded === 0) logEntry.status = 'FAILED';

    await SyncLog.create(logEntry);
    return logEntry;
  }

  async syncJiraToSF(config) {
    const startTime = Date.now();
    const logEntry = {
      direction: 'JIRA_TO_SF',
      status: 'SUCCESS',
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      errors: [],
      ruleResults: [],
    };

    const ruleStats = {
      STATUS_SYNC:    makeRuleStat(),
      PRIORITY_SYNC:  makeRuleStat(),
      COMMENT_MIRROR: makeRuleStat(),
      AUTO_CLOSE:     makeRuleStat(),
      ESCALATION:     makeRuleStat(),
    };

    try {
      const sinceDate   = this.lastSyncTime || new Date(Date.now() - 60 * 60 * 1000);
      const jiraIssues  = await jiraService.getModifiedIssues(
        config.jiraProjectKey, sinceDate, config.filters?.jira
      );

      const linkedIssues = jiraIssues.filter((i) =>
        i.fields.labels?.includes('salesforce-sync')
      );

      logEntry.recordsProcessed = linkedIssues.length;

      for (const issue of linkedIssues) {
        try {
          const syncRecord = await SyncRecord.findOne({ jiraIssueKey: issue.key });
          if (!syncRecord) continue;

          // Fetch the live SF record
          let sfRecord;
          try {
            sfRecord = await salesforceService.getRecordById(
              config.salesforceObjectType, syncRecord.salesforceId
            );
          } catch {
            logEntry.recordsFailed++;
            continue;
          }

          // Field sync
          const sfData = this.mapJiraToSalesforce(
            issue, config.salesforceObjectType, config.fieldMappings
          );
          if (Object.keys(sfData).length > 0) {
            await salesforceService.updateRecord(
              config.salesforceObjectType, syncRecord.salesforceId, sfData
            );
          }

          // ── Apply all 5 rules ──────────────────────────────────────────
          await this.ruleStatusSync(
            syncRecord, sfRecord, issue, config, ruleStats.STATUS_SYNC
          );
          await this.rulePrioritySync(
            syncRecord, sfRecord, issue, config, ruleStats.PRIORITY_SYNC
          );
          await this.ruleCommentMirror(
            syncRecord, config, ruleStats.COMMENT_MIRROR
          );
          await this.ruleAutoClose(
            syncRecord, sfRecord, issue, config, ruleStats.AUTO_CLOSE
          );
          await this.ruleEscalation(
            syncRecord, sfRecord, issue, config, ruleStats.ESCALATION
          );

          syncRecord.lastSyncedAt = new Date();
          syncRecord.lastSyncDirection = 'JIRA_TO_SF';
          syncRecord.metadata.jiraIssue = issue;
          await syncRecord.save();

          logEntry.recordsSucceeded++;
        } catch (err) {
          logEntry.recordsFailed++;
          logEntry.errors.push({ message: err.message, recordId: issue.key, source: 'JIRA_TO_SF' });
          logger.error(`Failed to sync JIRA issue ${issue.key}:`, err.message);
        }
      }
    } catch (err) {
      logEntry.status = 'FAILED';
      logEntry.errors.push({ message: err.message, source: 'JIRA_TO_SF' });
      logger.error('JIRA→SF sync batch failed:', err.message);
    }

    logEntry.duration = Date.now() - startTime;
    logEntry.ruleResults = Object.entries(ruleStats).map(([rule, s]) => ({ rule, ...s }));
    if (logEntry.recordsFailed > 0 && logEntry.recordsSucceeded > 0)  logEntry.status = 'PARTIAL';
    else if (logEntry.recordsFailed > 0) logEntry.status = 'FAILED';

    await SyncLog.create(logEntry);
    return logEntry;
  }

  // ── Main entry ─────────────────────────────────────────────────────────────
  async runSync() {
    if (this.running) {
      logger.warn('Sync already running, skipping...');
      return { skipped: true };
    }

    this.running = true;
    this.stats.totalSyncs++;
    const results = [];

    try {
      const configs = await SyncConfig.find({ isActive: true });
      logger.info(`Running sync for ${configs.length} active config(s)`);

      for (const config of configs) {
        if (config.syncDirection === 'SF_TO_JIRA' || config.syncDirection === 'BIDIRECTIONAL') {
          results.push(await this.syncSFtoJira(config));
        }
        if (config.syncDirection === 'JIRA_TO_SF' || config.syncDirection === 'BIDIRECTIONAL') {
          results.push(await this.syncJiraToSF(config));
        }
      }

      this.lastSyncTime = new Date();
      this.stats.successfulSyncs++;
      this.stats.recordsSynced += results.reduce((a, r) => a + r.recordsSucceeded, 0);
    } catch (err) {
      this.stats.failedSyncs++;
      logger.error('Sync run failed:', err.message);
    } finally {
      this.running = false;
    }

    return { results, lastSyncTime: this.lastSyncTime, stats: this.stats };
  }

  getStatus() {
    return {
      running:      this.running,
      lastSyncTime: this.lastSyncTime,
      stats:        this.stats,
    };
  }

  // Return static rule definitions for the frontend
  getRuleDefinitions() {
    return [
      {
        id:       'STATUS_SYNC',
        name:     'Status Sync',
        trigger:  'Any run',
        action:   'SF status → JIRA transition (bidirectional)',
        priority: 1,
      },
      {
        id:       'PRIORITY_SYNC',
        name:     'Priority Sync',
        trigger:  'Any run',
        action:   'SF P1/Critical/Urgent → JIRA Highest; reverse synced back',
        priority: 2,
      },
      {
        id:       'COMMENT_MIRROR',
        name:     'Comment Mirror',
        trigger:  'Any run',
        action:   'New comments synced both ways within 1h window (no duplicates)',
        priority: 3,
      },
      {
        id:       'AUTO_CLOSE',
        name:     'Auto-Close',
        trigger:  'Any run',
        action:   'SF case closed when JIRA issue transitions to Done',
        priority: 4,
      },
      {
        id:       'ESCALATION',
        name:     'Escalation',
        trigger:  'Any run',
        action:   'Cases open >48h with no JIRA progress flagged + priority bumped',
        priority: 5,
      },
    ];
  }
}

module.exports = new SyncEngine();
