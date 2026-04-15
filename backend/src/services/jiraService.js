const axios = require('axios');
const logger = require('../utils/logger');

class JiraService {
  constructor() {
    this.baseUrl  = process.env.JIRA_BASE_URL;
    this.email    = process.env.JIRA_EMAIL;
    this.apiToken = process.env.JIRA_API_TOKEN;
    this.client   = null;
  }

  getClient() {
    if (!this.client) {
      this.client = axios.create({
        baseURL: `${this.baseUrl}/rest/api/3`,
        auth:    { username: this.email, password: this.apiToken },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      });
    }
    return this.client;
  }

  // ── Issues ─────────────────────────────────────────────────────────────────

  async getModifiedIssues(projectKey, sinceDate, jqlFilter = '') {
    const since = sinceDate
      ? new Date(sinceDate).toISOString().split('T')[0]
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let jql = `project = "${projectKey}" AND updated >= "${since}"`;
    if (jqlFilter) jql += ` AND ${jqlFilter}`;
    jql += ' ORDER BY updated DESC';

    try {
      const response = await this.getClient().get('/search', {
        params: {
          jql,
          maxResults: 200,
          fields: 'summary,description,status,priority,assignee,reporter,issuetype,created,updated,labels,comment',
        },
      });
      logger.info(`Fetched ${response.data.issues.length} JIRA issues from ${projectKey}`);
      return response.data.issues;
    } catch (error) {
      logger.error('Error fetching JIRA issues:', error.response?.data || error.message);
      throw error;
    }
  }

  async getIssueByKey(issueKey) {
    try {
      const response = await this.getClient().get(`/issue/${issueKey}`, {
        params: { fields: 'summary,description,status,priority,assignee,comment,labels,updated' },
      });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching JIRA issue ${issueKey}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async createIssue(projectKey, issueType, data) {
    const payload = {
      fields: {
        project:   { key: projectKey },
        issuetype: { name: issueType || 'Task' },
        summary:   data.summary || 'Synced from Salesforce',
        description: data.description
          ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: data.description }] }] }
          : undefined,
        priority: data.priority ? { name: data.priority } : undefined,
        labels: data.labels || ['salesforce-sync'],
        ...data.extraFields,
      },
    };
    try {
      const response = await this.getClient().post('/issue', payload);
      logger.info(`Created JIRA issue: ${response.data.key}`);
      return response.data;
    } catch (error) {
      logger.error('Error creating JIRA issue:', error.response?.data || error.message);
      throw error;
    }
  }

  async updateIssue(issueKey, data) {
    const fields = {};
    if (data.summary) fields.summary = data.summary;
    if (data.description) {
      fields.description = {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: data.description }] }],
      };
    }
    if (data.priority) fields.priority = { name: data.priority };

    try {
      await this.getClient().put(`/issue/${issueKey}`, { fields });
      logger.info(`Updated JIRA issue: ${issueKey}`);
      return true;
    } catch (error) {
      logger.error(`Error updating JIRA issue ${issueKey}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async transitionIssue(issueKey, statusName) {
    try {
      const transitionsRes = await this.getClient().get(`/issue/${issueKey}/transitions`);
      const transition = transitionsRes.data.transitions.find(
        (t) => t.name.toLowerCase() === statusName.toLowerCase()
      );
      if (!transition) {
        logger.warn(`No transition found for "${statusName}" on ${issueKey}`);
        return false;
      }
      await this.getClient().post(`/issue/${issueKey}/transitions`, {
        transition: { id: transition.id },
      });
      logger.info(`Transitioned ${issueKey} → ${statusName}`);
      return true;
    } catch (error) {
      logger.error(`Error transitioning ${issueKey}:`, error.response?.data || error.message);
      throw error;
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  /**
   * Fetch comments on a JIRA issue created after sinceDate.
   */
  async getIssueComments(issueKey, sinceDate) {
    try {
      const response = await this.getClient().get(`/issue/${issueKey}/comment`, {
        params: { orderBy: 'created', maxResults: 100 },
      });
      const all = response.data.comments || [];
      if (!sinceDate) return all;
      const cutoff = new Date(sinceDate).getTime();
      return all.filter((c) => new Date(c.created).getTime() >= cutoff);
    } catch (error) {
      logger.error(`Error fetching comments for ${issueKey}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Post a plain-text comment to a JIRA issue.
   */
  async addComment(issueKey, text) {
    try {
      const response = await this.getClient().post(`/issue/${issueKey}/comment`, {
        body: {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`Error adding comment to ${issueKey}:`, error.response?.data || error.message);
      throw error;
    }
  }

  // ── Misc ───────────────────────────────────────────────────────────────────

  async getConnectionStatus() {
    try {
      const response = await this.getClient().get('/myself');
      return {
        connected:   true,
        email:       response.data.emailAddress,
        displayName: response.data.displayName,
        accountId:   response.data.accountId,
        baseUrl:     this.baseUrl,
      };
    } catch (error) {
      return { connected: false, error: error.response?.data?.message || error.message };
    }
  }

  async getProjects() {
    try {
      const response = await this.getClient().get('/project');
      return response.data;
    } catch (error) {
      logger.error('Error fetching JIRA projects:', error.message);
      throw error;
    }
  }
}

module.exports = new JiraService();
