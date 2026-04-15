import React, { useState, useEffect, useCallback } from 'react';
import { syncAPI } from '../services/api';

const STATUS_CLASS = {
  SUCCESS: 'badge-green',
  FAILED:  'badge-red',
  PARTIAL: 'badge-yellow',
};

const RULE_COLORS = {
  STATUS_SYNC:    '#3b82f6',
  PRIORITY_SYNC:  '#f59e0b',
  COMMENT_MIRROR: '#10b981',
  AUTO_CLOSE:     '#8b5cf6',
  ESCALATION:     '#ef4444',
};

const RULE_ICONS = {
  STATUS_SYNC:    '⇄',
  PRIORITY_SYNC:  '↑',
  COMMENT_MIRROR: '💬',
  AUTO_CLOSE:     '✓',
  ESCALATION:     '⚠',
};

function RuleBreakdown({ ruleResults }) {
  if (!ruleResults?.length) return null;
  const active = ruleResults.filter((r) => r.fired > 0);
  if (!active.length) return <span style={{ color: '#5a6478', fontSize: 11 }}>no actions</span>;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {active.map((r) => (
        <span
          key={r.rule}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 100,
            fontSize: 10,
            fontFamily: 'Space Mono',
            background: `${RULE_COLORS[r.rule]}18`,
            color: RULE_COLORS[r.rule],
            border: `1px solid ${RULE_COLORS[r.rule]}30`,
          }}
        >
          {RULE_ICONS[r.rule]} {r.rule.replace('_', ' ')} ×{r.fired}
          {r.failed > 0 && <span style={{ color: '#ef4444' }}>({r.failed} err)</span>}
        </span>
      ))}
    </div>
  );
}

export default function SyncLogs() {
  const [data, setData] = useState({ logs: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedLog, setExpandedLog] = useState(null);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await syncAPI.getLogs({ limit, page });
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(data.total / limit);

  const summary = data.logs.reduce(
    (acc, log) => ({
      success:      acc.success + (log.status === 'SUCCESS' ? 1 : 0),
      failed:       acc.failed  + (log.status === 'FAILED'  ? 1 : 0),
      partial:      acc.partial + (log.status === 'PARTIAL' ? 1 : 0),
      totalRecords: acc.totalRecords + log.recordsProcessed,
      ruleActions:  acc.ruleActions  + (log.ruleResults || []).reduce((a, r) => a + (r.fired || 0), 0),
    }),
    { success: 0, failed: 0, partial: 0, totalRecords: 0, ruleActions: 0 }
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Sync Logs</div>
          <div className="page-subtitle">Detailed audit trail with per-rule action breakdown</div>
        </div>
        <button className="btn btn-ghost" onClick={load}>⟳ Refresh</button>
      </div>

      <div className="page-body">
        {/* Summary stats */}
        <div
          className="stats-grid"
          style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}
        >
          <div className="stat-card green">
            <div className="stat-label">Successful</div>
            <div className="stat-value">{summary.success}</div>
            <div className="stat-sub">This page</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Failed</div>
            <div className="stat-value">{summary.failed}</div>
            <div className="stat-sub">This page</div>
          </div>
          <div className="stat-card yellow">
            <div className="stat-label">Partial</div>
            <div className="stat-value">{summary.partial}</div>
            <div className="stat-sub">This page</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-label">Records Processed</div>
            <div className="stat-value">{summary.totalRecords}</div>
            <div className="stat-sub">This page</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Rule Actions</div>
            <div className="stat-value">{summary.ruleActions}</div>
            <div className="stat-sub">Status/priority/comment/etc</div>
          </div>
        </div>

        {/* Legend */}
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: '14px 20px',
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: '#5a6478', fontWeight: 600 }}>Rules:</span>
          {Object.entries(RULE_ICONS).map(([rule, icon]) => (
            <span
              key={rule}
              style={{
                fontSize: 11,
                fontFamily: 'Space Mono',
                color: RULE_COLORS[rule],
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {icon} {rule.replace('_', ' ')}
            </span>
          ))}
        </div>

        <div className="card">
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : data.logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">▦</div>
              <div className="empty-text">No sync logs yet. Run a sync to see activity here.</div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Direction</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Proc.</th>
                      <th style={{ textAlign: 'right' }}>✓</th>
                      <th style={{ textAlign: 'right' }}>✕</th>
                      <th>Duration</th>
                      <th>Rule Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map((log) => {
                      const isExpanded = expandedLog === log._id;
                      const totalRuleFired = (log.ruleResults || []).reduce(
                        (a, r) => a + (r.fired || 0),
                        0
                      );
                      const hasErrors = log.errors?.length > 0;

                      return (
                        <React.Fragment key={log._id}>
                          <tr
                            onClick={() => setExpandedLog(isExpanded ? null : log._id)}
                            style={{
                              cursor: (hasErrors || totalRuleFired > 0) ? 'pointer' : 'default',
                              background: isExpanded ? 'rgba(59,130,246,0.04)' : undefined,
                            }}
                          >
                            <td>
                              <span className="mono">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#8b5cf6' }}>
                                {log.direction === 'SF_TO_JIRA'
                                  ? 'SF → JIRA'
                                  : log.direction === 'JIRA_TO_SF'
                                  ? 'JIRA → SF'
                                  : '↔ Bi'}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${STATUS_CLASS[log.status] || 'badge-gray'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="mono">{log.recordsProcessed}</span>
                            </td>
                            <td style={{ textAlign: 'right', color: '#10b981' }}>
                              <span className="mono">{log.recordsSucceeded}</span>
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                color: log.recordsFailed > 0 ? '#ef4444' : '#5a6478',
                              }}
                            >
                              <span className="mono">{log.recordsFailed}</span>
                            </td>
                            <td>
                              <span className="mono" style={{ color: '#8b95a8' }}>
                                {log.duration ? `${log.duration}ms` : '—'}
                              </span>
                            </td>
                            <td>
                              {totalRuleFired > 0 ? (
                                <span
                                  style={{
                                    fontFamily: 'Space Mono',
                                    fontSize: 11,
                                    color: '#3b82f6',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {totalRuleFired} actions {isExpanded ? '▲' : '▼'}
                                </span>
                              ) : (
                                <span style={{ color: '#5a6478', fontSize: 11 }}>—</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr>
                              <td
                                colSpan={8}
                                style={{
                                  background: '#0f1117',
                                  padding: '14px 20px',
                                  borderBottom: '1px solid #1f2937',
                                }}
                              >
                                {/* Rule breakdown */}
                                {(log.ruleResults?.length > 0) && (
                                  <div style={{ marginBottom: hasErrors ? 14 : 0 }}>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        fontFamily: 'Space Mono',
                                        color: '#5a6478',
                                        marginBottom: 8,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                      }}
                                    >
                                      Rule breakdown
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                      {log.ruleResults.map((r) => (
                                        <div
                                          key={r.rule}
                                          style={{
                                            background: `${RULE_COLORS[r.rule]}10`,
                                            border: `1px solid ${RULE_COLORS[r.rule]}25`,
                                            borderRadius: 8,
                                            padding: '8px 14px',
                                            minWidth: 140,
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontSize: 11,
                                              fontFamily: 'Space Mono',
                                              color: RULE_COLORS[r.rule],
                                              marginBottom: 4,
                                            }}
                                          >
                                            {RULE_ICONS[r.rule]} {r.rule.replace('_', ' ')}
                                          </div>
                                          <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                                            <span style={{ color: '#8b95a8' }}>
                                              fired: <strong style={{ color: '#e8edf5' }}>{r.fired}</strong>
                                            </span>
                                            <span style={{ color: '#10b981' }}>✓{r.succeeded}</span>
                                            {r.failed > 0 && (
                                              <span style={{ color: '#ef4444' }}>✕{r.failed}</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Errors */}
                                {hasErrors && (
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        fontFamily: 'Space Mono',
                                        color: '#5a6478',
                                        marginBottom: 8,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                      }}
                                    >
                                      Errors ({log.errors.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                      {log.errors.map((err, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                                          <span
                                            style={{
                                              fontFamily: 'Space Mono',
                                              color: '#8b5cf6',
                                              minWidth: 90,
                                            }}
                                          >
                                            {err.source}
                                          </span>
                                          {err.recordId && (
                                            <span
                                              style={{
                                                fontFamily: 'Space Mono',
                                                color: '#5a6478',
                                                minWidth: 180,
                                              }}
                                            >
                                              {err.recordId}
                                            </span>
                                          )}
                                          <span style={{ color: '#ef4444' }}>{err.message}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >←</button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >→</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
