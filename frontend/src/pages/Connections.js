import React, { useState, useEffect, useCallback } from 'react';
import { connectionAPI } from '../services/api';

function ConnectionCard({ title, logo, status, details, loading }) {
  return (
    <div className="connection-card">
      <div className="connection-logo">{logo}</div>
      <div className="connection-name">{title}</div>
      <div className="connection-detail">
        {loading ? 'Checking…' : status?.connected ? `Connected as ${details}` : 'Not connected'}
      </div>
      <div className="connection-status-row">
        {loading ? (
          <span className="badge badge-gray"><span className="dot" />Checking</span>
        ) : status?.connected ? (
          <span className="badge badge-green"><span className="dot" />Connected</span>
        ) : (
          <span className="badge badge-red"><span className="dot" />Disconnected</span>
        )}
      </div>
      {status?.connected && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(status).filter(([k]) => !['connected', 'error'].includes(k)).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#5a6478', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
              <span style={{ fontFamily: 'Space Mono', color: '#8b95a8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
      {!status?.connected && status?.error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, fontSize: 12, color: '#ef4444', fontFamily: 'Space Mono' }}>
          {status.error}
        </div>
      )}
    </div>
  );
}

export default function Connections() {
  const [sf, setSf] = useState(null);
  const [jira, setJira] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await connectionAPI.testAll();
      setSf(result.salesforce);
      setJira(result.jira);
      if (result.jira?.connected) {
        try {
          const projs = await connectionAPI.getJiraProjects();
          setProjects(projs);
        } catch {}
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testConnections = async () => {
    setTesting(true);
    await load();
    setTesting(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Connections</div>
          <div className="page-subtitle">Manage Salesforce and JIRA integration credentials</div>
        </div>
        <button className="btn btn-ghost" onClick={testConnections} disabled={testing || loading}>
          {testing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '⟳'}
          {testing ? 'Testing…' : 'Test Connections'}
        </button>
      </div>
      <div className="page-body">
        {/* Config instructions */}
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)' }}>
          <div className="card-title">Configuration</div>
          <p style={{ fontSize: 13, color: '#8b95a8', marginBottom: 12 }}>
            Credentials are loaded from environment variables in the backend. Set them in your <code style={{ fontFamily: 'Space Mono', background: '#1e2535', padding: '2px 6px', borderRadius: 4 }}>.env</code> file:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#3b82f6', marginBottom: 8 }}>SALESFORCE</div>
              {['SALESFORCE_USERNAME', 'SALESFORCE_PASSWORD', 'SALESFORCE_SECURITY_TOKEN', 'SALESFORCE_LOGIN_URL'].map(k => (
                <div key={k} style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#5a6478', padding: '3px 0' }}>{k}</div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#0052cc', marginBottom: 8 }}>JIRA</div>
              {['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'].map(k => (
                <div key={k} style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#5a6478', padding: '3px 0' }}>{k}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Connection Cards */}
        <div className="connection-grid" style={{ marginBottom: 24 }}>
          <ConnectionCard
            title="Salesforce"
            logo="☁"
            loading={loading}
            status={sf}
            details={sf?.username}
          />
          <ConnectionCard
            title="JIRA / Atlassian"
            logo="◈"
            loading={loading}
            status={jira}
            details={jira?.email}
          />
        </div>

        {/* Sync Flow */}
        <div className="sync-arrow-display">
          <div className="sync-platform">
            <div style={{ fontSize: 28, marginBottom: 4 }}>☁</div>
            <div className="sync-platform-name" style={{ color: '#00a1e0' }}>Salesforce</div>
            <div className="sync-platform-sub">Cases, Opportunities, Leads, Tasks</div>
          </div>
          <div className="sync-arrows">
            <span>→</span>
            <span className="arrow-label">BIDIRECTIONAL</span>
            <span>←</span>
          </div>
          <div className="sync-platform">
            <div style={{ fontSize: 28, marginBottom: 4 }}>◈</div>
            <div className="sync-platform-name" style={{ color: '#0052cc' }}>JIRA</div>
            <div className="sync-platform-sub">Issues, Tasks, Epics</div>
          </div>
        </div>

        {/* JIRA Projects */}
        {projects.length > 0 && (
          <div className="card">
            <div className="card-title">Available JIRA Projects</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Style</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td><span className="mono">{p.key}</span></td>
                      <td>{p.name}</td>
                      <td><span className="badge badge-blue">{p.projectTypeKey}</span></td>
                      <td><span className="badge badge-gray">{p.style || 'classic'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
