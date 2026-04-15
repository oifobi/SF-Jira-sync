import React, { useState, useEffect, useCallback } from 'react';
import { syncAPI } from '../services/api';

const STATUS_BADGES = {
  ACTIVE:  'badge-green',
  PAUSED:  'badge-yellow',
  ERROR:   'badge-red',
  DELETED: 'badge-gray',
};

function DetailModal({ record, onClose }) {
  const rows = [
    ['Salesforce ID',     record.salesforceId],
    ['SF Type',           record.salesforceType],
    ['JIRA Issue Key',    record.jiraIssueKey],
    ['JIRA Project',      record.jiraProjectKey || '—'],
    ['Status',            record.status],
    ['Last Synced',       record.lastSyncedAt ? new Date(record.lastSyncedAt).toLocaleString() : '—'],
    ['Last Direction',    record.lastSyncDirection || '—'],
    ['Created in SF',     record.createdInSf ? new Date(record.createdInSf).toLocaleString() : '—'],
    ['SF Priority',       record.lastKnownSfPriority || '—'],
    ['Escalated',         record.escalated ? `Yes — ${new Date(record.escalatedAt).toLocaleString()}` : 'No'],
    ['Auto-Closed',       record.autoClosedAt ? new Date(record.autoClosedAt).toLocaleString() : 'No'],
    ['Mirrored SF Comments',   record.mirroredSfCommentIds?.length ?? 0],
    ['Mirrored JIRA Comments', record.mirroredJiraCommentIds?.length ?? 0],
    ['Error Count',       record.errorCount],
    ['Last Error',        record.lastError || 'None'],
    ['Created',           new Date(record.createdAt).toLocaleString()],
    ['Updated',           new Date(record.updatedAt).toLocaleString()],
  ];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">
            Record Detail — <span style={{ color: '#0052cc', fontFamily: 'Space Mono' }}>{record.jiraIssueKey}</span>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {record.escalated && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            ⚠️ This record has been <strong>escalated</strong> — open {'>'}48h with no JIRA progress.
            {record.escalationNote && <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>{record.escalationNote}</div>}
          </div>
        )}
        {record.autoClosedAt && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            ✅ SF case was <strong>auto-closed</strong> on {new Date(record.autoClosedAt).toLocaleString()} because JIRA moved to Done.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map(([label, value]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid #1f2937',
                padding: '9px 0',
              }}
            >
              <span style={{ fontSize: 12, color: '#5a6478' }}>{label}</span>
              <span
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: 12,
                  color: '#e8edf5',
                  maxWidth: '60%',
                  textAlign: 'right',
                  wordBreak: 'break-all',
                }}
              >
                {String(value)}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function SyncRecords() {
  const [data, setData] = useState({ records: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit,
        page,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(escalatedOnly && { escalated: 'true' }),
      };
      const result = await syncAPI.getRecords(params);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, escalatedOnly]);

  useEffect(() => { load(); }, [load]);

  const unlink = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Unlink this sync record?')) return;
    try {
      await syncAPI.deleteRecord(id);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(data.total / limit);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Sync Records</div>
          <div className="page-subtitle">All linked Salesforce ↔ JIRA record pairs</div>
        </div>
        <span className="badge badge-blue">{data.total} total</span>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ flex: 1, minWidth: 200, maxWidth: 320 }}
            placeholder="Search by SF ID or JIRA key…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ERROR">Error</option>
            <option value="DELETED">Deleted</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#8b95a8' }}>
            <input
              type="checkbox"
              checked={escalatedOnly}
              onChange={(e) => { setEscalatedOnly(e.target.checked); setPage(1); }}
              style={{ width: 'auto' }}
            />
            Escalated only
          </label>
          <button className="btn btn-ghost" onClick={load}>⟳ Refresh</button>
        </div>

        <div className="card">
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : data.records.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">≋</div>
              <div className="empty-text">
                {escalatedOnly
                  ? 'No escalated records — great news!'
                  : 'No sync records found. Configure and run a sync first.'}
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Salesforce ID</th>
                      <th>Type</th>
                      <th>JIRA Issue</th>
                      <th>Status</th>
                      <th>Flags</th>
                      <th>Last Sync</th>
                      <th>Direction</th>
                      <th>Comments</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((r) => (
                      <tr
                        key={r._id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedRecord(r)}
                      >
                        <td><span className="mono">{r.salesforceId}</span></td>
                        <td>
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>
                            {r.salesforceType}
                          </span>
                        </td>
                        <td>
                          <span className="mono" style={{ color: '#0052cc' }}>{r.jiraIssueKey}</span>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGES[r.status] || 'badge-gray'}`}>
                            <span className="dot" />{r.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {r.escalated && (
                              <span className="badge badge-red" style={{ fontSize: 10 }}>⚠ Escalated</span>
                            )}
                            {r.autoClosedAt && (
                              <span className="badge badge-green" style={{ fontSize: 10 }}>✓ Auto-Closed</span>
                            )}
                            {!r.escalated && !r.autoClosedAt && (
                              <span style={{ color: '#5a6478', fontSize: 11 }}>—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: '#8b95a8' }}>
                            {r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString() : '—'}
                          </span>
                        </td>
                        <td>
                          {r.lastSyncDirection ? (
                            <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#8b5cf6' }}>
                              {r.lastSyncDirection === 'SF_TO_JIRA' ? 'SF → JIRA' : 'JIRA → SF'}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: '#8b95a8' }}>
                            {(r.mirroredSfCommentIds?.length || 0) + (r.mirroredJiraCommentIds?.length || 0)} mirrored
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={(e) => unlink(r._id, e)}
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    ))}
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

      {selectedRecord && (
        <DetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  );
}
