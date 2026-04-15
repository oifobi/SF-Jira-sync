import React, { useState, useEffect, useCallback } from 'react';
import { syncAPI } from '../services/api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ── Tooltip ──────────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#161b24', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: '#8b95a8', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Rule definitions (mirrors backend) ───────────────────────────────────────
const RULE_META = [
  {
    id: 'STATUS_SYNC',
    icon: '⇄',
    name: 'Status Sync',
    trigger: 'Any run',
    action: 'SF status → JIRA transition (bidirectional)',
    color: '#3b82f6',
  },
  {
    id: 'PRIORITY_SYNC',
    icon: '↑',
    name: 'Priority Sync',
    trigger: 'Any run',
    action: 'SF P1/Critical/Urgent → JIRA Highest; reverse synced back',
    color: '#f59e0b',
  },
  {
    id: 'COMMENT_MIRROR',
    icon: '💬',
    name: 'Comment Mirror',
    trigger: 'Any run',
    action: 'New comments synced both ways (last 1h window, no duplicates)',
    color: '#10b981',
  },
  {
    id: 'AUTO_CLOSE',
    icon: '✓',
    name: 'Auto-Close',
    trigger: 'Any run',
    action: 'SF case closed when JIRA issue transitions to Done',
    color: '#8b5cf6',
  },
  {
    id: 'ESCALATION',
    icon: '⚠',
    name: 'Escalation',
    trigger: 'Any run',
    action: 'Cases open >48h with no JIRA progress flagged + priority bumped',
    color: '#ef4444',
  },
];

// ── RuleRow ───────────────────────────────────────────────────────────────────
function RuleRow({ rule, stats }) {
  const s = stats?.[rule.id];
  return (
    <tr>
      <td>
        <span style={{ fontSize: 16 }}>{rule.icon}</span>
      </td>
      <td>
        <span style={{ fontFamily: 'Space Mono', fontSize: 12, color: rule.color, fontWeight: 700 }}>
          {rule.name}
        </span>
      </td>
      <td>
        <span className="badge badge-gray" style={{ fontSize: 10 }}>{rule.trigger}</span>
      </td>
      <td style={{ fontSize: 12, color: '#8b95a8', maxWidth: 340 }}>{rule.action}</td>
      <td style={{ textAlign: 'right' }}>
        {s ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#5a6478' }}>
              fired: <strong style={{ color: '#e8edf5' }}>{s.fired}</strong>
            </span>
            <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#10b981' }}>✓{s.succeeded}</span>
            {s.failed > 0 && (
              <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#ef4444' }}>✕{s.failed}</span>
            )}
          </div>
        ) : (
          <span style={{ color: '#5a6478', fontSize: 11 }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [alert, setAlert] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, status, logData] = await Promise.all([
        syncAPI.getStats(),
        syncAPI.getStatus(),
        syncAPI.getLogs({ limit: 20 }),
      ]);
      setStats(s);
      setSyncStatus(status);
      setLogs(logData.logs || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const triggerSync = async () => {
    setTriggering(true);
    try {
      await syncAPI.trigger();
      setAlert({ type: 'success', message: 'Sync triggered successfully!' });
      setTimeout(load, 2000);
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setTriggering(false);
      setTimeout(() => setAlert(null), 4000);
    }
  };

  const chartData = [...logs].reverse().map((log, i) => ({
    name: i % 4 === 0
      ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '',
    succeeded: log.recordsSucceeded,
    failed:    log.recordsFailed,
  }));

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div><div className="page-title">Dashboard</div></div>
        </div>
        <div className="loading-wrap"><div className="spinner" /></div>
      </div>
    );
  }

  const isRunning = syncStatus?.running;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Real-time Salesforce ↔ JIRA sync agent overview</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isRunning && (
            <span className="badge badge-blue"><span className="dot pulse" />Syncing…</span>
          )}
          <button
            className="btn btn-primary"
            onClick={triggerSync}
            disabled={triggering || isRunning}
          >
            {triggering
              ? <span className="spinner" style={{ width: 14, height: 14 }} />
              : '⟲'}
            {triggering ? 'Triggering…' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {alert && (
          <div className={`alert alert-${alert.type}`}>
            {alert.type === 'error' ? '✕' : '✓'} {alert.message}
          </div>
        )}

        {/* ── Stats grid ───────────────────────────────────────────────── */}
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-label">Total Records</div>
            <div className="stat-value">{stats?.records?.total ?? '—'}</div>
            <div className="stat-sub">Tracked sync pairs</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Active Syncs</div>
            <div className="stat-value">{stats?.records?.active ?? '—'}</div>
            <div className="stat-sub">Healthy pairs</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Escalated</div>
            <div className="stat-value">{stats?.records?.escalated ?? '—'}</div>
            <div className="stat-sub">Open &gt;48h, no progress</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Auto-Closed</div>
            <div className="stat-value">{stats?.records?.autoClosed ?? '—'}</div>
            <div className="stat-sub">Via JIRA Done rule</div>
          </div>
          <div className="stat-card yellow">
            <div className="stat-label">Recent Failures</div>
            <div className="stat-value">{stats?.recentActivity?.totalFailed ?? '—'}</div>
            <div className="stat-sub">In last 20 syncs</div>
          </div>
        </div>

        {/* ── Charts + engine status ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          <div className="card">
            <div className="card-title">Sync Activity</div>
            {chartData.length > 0 ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="name" tick={{ fill: '#5a6478', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#5a6478', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="succeeded" name="Succeeded" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="failed"    name="Failed"    stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-icon">📊</div>
                <div className="empty-text">No sync data yet</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Agent Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Status',        isRunning ? <span className="badge badge-blue"><span className="dot pulse" />Running</span> : <span className="badge badge-green"><span className="dot" />Idle</span>],
                ['Last Sync',     syncStatus?.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleTimeString() : 'Never'],
                ['Total Syncs',   syncStatus?.stats?.totalSyncs ?? 0],
                ['Successful',    <span style={{ color: '#10b981', fontFamily: 'Space Mono', fontSize: 12 }}>{syncStatus?.stats?.successfulSyncs ?? 0}</span>],
                ['Failed',        <span style={{ color: syncStatus?.stats?.failedSyncs ? '#ef4444' : '#5a6478', fontFamily: 'Space Mono', fontSize: 12 }}>{syncStatus?.stats?.failedSyncs ?? 0}</span>],
                ['Records Synced', syncStatus?.stats?.recordsSynced ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #1f2937' }}>
                  <span style={{ fontSize: 13, color: '#8b95a8' }}>{label}</span>
                  {typeof value === 'object' && React.isValidElement(value)
                    ? value
                    : <span style={{ fontFamily: 'Space Mono', fontSize: 12, color: '#e8edf5' }}>{value}</span>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── AGENT RULES TABLE ─────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>What it does</div>
            <span className="badge badge-blue">5 active rules</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Rule</th>
                  <th>Trigger</th>
                  <th>Action</th>
                  <th style={{ textAlign: 'right' }}>Recent Activity</th>
                </tr>
              </thead>
              <tbody>
                {RULE_META.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} stats={stats?.ruleStats} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recent Sync Logs ──────────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Recent Sync Logs</div>
          {logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-text">No logs yet. Trigger a sync to get started.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Direction</th>
                    <th>Status</th>
                    <th>Processed</th>
                    <th>✓</th>
                    <th>✕</th>
                    <th>Duration</th>
                    <th>Rules fired</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const totalRuleFired = (log.ruleResults || []).reduce((a, r) => a + (r.fired || 0), 0);
                    return (
                      <tr key={log._id}>
                        <td><span className="mono">{new Date(log.timestamp).toLocaleString()}</span></td>
                        <td>
                          <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#8b5cf6' }}>
                            {log.direction === 'SF_TO_JIRA' ? 'SF → JIRA' : log.direction === 'JIRA_TO_SF' ? 'JIRA → SF' : '↔'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${log.status === 'SUCCESS' ? 'badge-green' : log.status === 'FAILED' ? 'badge-red' : 'badge-yellow'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td>{log.recordsProcessed}</td>
                        <td style={{ color: '#10b981' }}>{log.recordsSucceeded}</td>
                        <td style={{ color: log.recordsFailed > 0 ? '#ef4444' : '#5a6478' }}>{log.recordsFailed}</td>
                        <td><span className="mono">{log.duration ? `${log.duration}ms` : '—'}</span></td>
                        <td>
                          <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: totalRuleFired > 0 ? '#3b82f6' : '#5a6478' }}>
                            {totalRuleFired > 0 ? `${totalRuleFired} actions` : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
