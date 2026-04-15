const jsforce = require('jsforce');
const logger = require('../utils/logger');

class SalesforceService {
  constructor() {
    this.conn = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.conn = new jsforce.Connection({
        loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
      });
      await this.conn.login(
        process.env.SALESFORCE_USERNAME,
        process.env.SALESFORCE_PASSWORD + process.env.SALESFORCE_SECURITY_TOKEN
      );
      this.connected = true;
      logger.info('Connected to Salesforce');
      return true;
    } catch (error) {
      this.connected = false;
      logger.error('Salesforce connection failed:', error.message);
      throw error;
    }
  }

  async ensureConnection() {
    if (!this.connected || !this.conn) await this.connect();
  }

  // ── Record queries ─────────────────────────────────────────────────────────

  async getModifiedRecords(objectType, sinceDate, filter = '') {
    await this.ensureConnection();

    const sinceStr = sinceDate
      ? new Date(sinceDate).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const fieldMap = {
      Case:        'Id, CaseNumber, Subject, Description, Status, Priority, AccountId, ContactId, OwnerId, CreatedDate, LastModifiedDate',
      Opportunity: 'Id, Name, Description, StageName, Amount, CloseDate, AccountId, OwnerId, CreatedDate, LastModifiedDate',
      Lead:        'Id, FirstName, LastName, Email, Company, Status, LeadSource, Description, CreatedDate, LastModifiedDate',
      Task:        'Id, Subject, Description, Status, Priority, OwnerId, WhatId, WhoId, ActivityDate, CreatedDate, LastModifiedDate',
    };

    const fields = fieldMap[objectType] || 'Id, Name, CreatedDate, LastModifiedDate';
    const where = filter
      ? `LastModifiedDate >= ${sinceStr} AND ${filter}`
      : `LastModifiedDate >= ${sinceStr}`;

    try {
      const result = await this.conn.query(
        `SELECT ${fields} FROM ${objectType} WHERE ${where} ORDER BY LastModifiedDate DESC LIMIT 200`
      );
      logger.info(`Fetched ${result.records.length} ${objectType} records from Salesforce`);
      return result.records;
    } catch (error) {
      logger.error(`Error fetching ${objectType} from Salesforce:`, error.message);
      throw error;
    }
  }

  async getRecordById(objectType, id) {
    await this.ensureConnection();
    try {
      return await this.conn.sobject(objectType).retrieve(id);
    } catch (error) {
      logger.error(`Error fetching ${objectType} ${id}:`, error.message);
      throw error;
    }
  }

  async updateRecord(objectType, id, data) {
    await this.ensureConnection();
    try {
      const result = await this.conn.sobject(objectType).update({ Id: id, ...data });
      logger.info(`Updated ${objectType} ${id} in Salesforce`);
      return result;
    } catch (error) {
      logger.error(`Error updating ${objectType} ${id}:`, error.message);
      throw error;
    }
  }

  async createRecord(objectType, data) {
    await this.ensureConnection();
    try {
      const result = await this.conn.sobject(objectType).create(data);
      logger.info(`Created ${objectType} in Salesforce: ${result.id}`);
      return result;
    } catch (error) {
      logger.error(`Error creating ${objectType}:`, error.message);
      throw error;
    }
  }

  // ── Comment support ────────────────────────────────────────────────────────

  /**
   * Fetch CaseComments created in the last `windowMs` milliseconds for a Case.
   * Returns [] for non-Case object types (Tasks use different comment mechanism).
   */
  async getCaseComments(caseId, sinceDate) {
    await this.ensureConnection();

    const sinceStr = sinceDate
      ? new Date(sinceDate).toISOString()
      : new Date(Date.now() - 60 * 60 * 1000).toISOString(); // default 1h

    try {
      const result = await this.conn.query(
        `SELECT Id, CommentBody, CreatedById, CreatedDate, CreatorName, IsPublic
         FROM CaseComment
         WHERE ParentId = '${caseId}'
           AND CreatedDate >= ${sinceStr}
         ORDER BY CreatedDate ASC`
      );
      return result.records;
    } catch (error) {
      // Non-Case objects won't have CaseComment — swallow gracefully
      logger.warn(`Could not fetch CaseComments for ${caseId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Post a public CaseComment on a Case.
   */
  async addCaseComment(caseId, body) {
    await this.ensureConnection();
    try {
      const result = await this.conn.sobject('CaseComment').create({
        ParentId: caseId,
        CommentBody: body,
        IsPublic: true,
      });
      logger.info(`Added CaseComment to ${caseId}`);
      return result;
    } catch (error) {
      logger.error(`Error adding CaseComment to ${caseId}:`, error.message);
      throw error;
    }
  }

  // ── Connection health ──────────────────────────────────────────────────────

  async getConnectionStatus() {
    try {
      await this.ensureConnection();
      const identity = await this.conn.identity();
      return {
        connected: true,
        username: identity.username,
        orgId: identity.organization_id,
        instanceUrl: this.conn.instanceUrl,
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

module.exports = new SalesforceService();
