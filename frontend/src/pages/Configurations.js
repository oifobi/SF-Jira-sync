import React, { useState, useEffect, useCallback } from 'react';
import { configAPI } from '../services/api';

const EMPTY_CONFIG = {
  name: '',
  salesforceObjectType: 'Case',
  jiraProjectKey: '',
  jiraIssueType: 'Task',
  syncDirection: 'BIDIRECTIONAL',
  syncIntervalMinutes: 5,
  isActive: true,
  fieldMappings: [
    { salesforceField: 'Subject', jiraField: 'summary' },
    { salesforceField: 'Description', jiraField: 'description' },
    { salesforceField: 'Priority', jiraField: 'priority' },
    { salesforceField: 'Status', jiraField: '_status' },
  ],
  filters: { salesforce: '', jira: '' },
  statusMappings: [
    { salesforceStatus: 'Open', jiraStatus: 'To Do' },
    { salesforceStatus: 'In Progress', jiraStatus: 'In Progress' },
    { salesforceStatus: 'Closed', jiraStatus: 'Done' },
  ],
  rules: {
    statusSync: true,
    prioritySync: true,
    commentMirror: true,
    autoClose: true,
    escalation: true,
    escalationThresholdHours: 48,
    caseCountEscalation: false,
    caseCountThreshold: 10,
    caseCountPriority: 'P1',
  },
};

const RULE_LABELS = [
  { key: 'statusSync',    label: 'Status Sync',     desc: 'SF status ↔ JIRA transitions' },
  { key: 'prioritySync',  label: 'Priority Sync',   desc: 'SF P1/Critical → JIRA Highest' },
  { key: 'commentMirror', label: 'Comment Mirror',  desc: 'Sync comments both ways (1h window)' },
  { key: 'autoClose',     label: 'Auto-Close',      desc: 'Close SF case when JIRA → Done' },
  { key: 'escalation',    label: 'Escalation',      desc: 'Flag stale cases after threshold hours' },
  { key: 'caseCountEscalation', label: 'Case Count Escalation', desc: 'Auto-bump to P0/P1 when cases reach threshold' },
];

function ConfigModal({ config, onClose, onSave }) {
  const [form, setForm] = useState(config || EMPTY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setFilter = (key, value) => setForm((f) => ({ ...f, filters: { ...f.filters, [key]: value } }));
  const setRule = (key, value) => setForm((f) => ({ ...f, rules: { ...f.rules, [key]: value } }));

  const updateMapping = (i, key, value) => {
    const m = [...form.fieldMappings];
    m[i] = { ...m[i], [key]: value };
    setForm((f) => ({ ...f, fieldMappings: m }));
  };
  const addMapping = () => setForm((f) => ({ ...f, fieldMappings: [...f.fieldMappings, { salesforceField: '', jiraField: '' }] }));
  const removeMapping = (i) => setForm((f) => ({ ...f, fieldMappings: f.fieldMappings.filter((_, idx) => idx !== i) }));

  const updateStatusMapping = (i, key, value) => {
    const m = [...form.statusMappings];
    m[i] = { ...m[i], [key]: value };
    setForm((f) => ({ ...f, statusMappings: m }));
  };
  const addStatusMapping = () => setForm((f) => ({ ...f, statusMappings: [...f.statusMappings, { salesforceStatus: '', jiraStatus: '' }] }));
  const removeStatusMapping = (i) => setForm((f) => ({ ...f, statusMappings: f.statusMappings.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, syncIntervalMinutes: parseInt(form.syncIntervalMinutes, 10) };
      if (config?._id) {
        await configAPI.update(config._id, payload);
      } else {
        await configAPI.create(payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{config?._id ? 'Edit Configuration' : 'New Configuration'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {error && <div className="alert alert-error">✕ {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Basic */}
          <div>
            <div className="card-title">Basic Settings</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Config Name</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Case to JIRA Sync" />
              </div>
              <div className="form-group">
                <label>Sync Interval (minutes)</label>
                <input type="number" value={form.syncIntervalMinutes} onChange={(e) => set('syncIntervalMinutes', e.target.value)} min={1} max={60} />
              </div>
              <div className="form-group">
                <label>Salesforce Object Type</label>
                <select value={form.salesforceObjectType} onChange={(e) => set('salesforceObjectType', e.target.value)}>
                  <option>Case</option>
                  <option>Opportunity</option>
                  <option>Lead</option>
                  <option>Task</option>
                </select>
              </div>
              <div className="form-group">
                <label>JIRA Project Key</label>
                <input value={form.jiraProjectKey} onChange={(e) => set('jiraProjectKey', e.target.value.toUpperCase())} placeholder="PROJ" />
              </div>
              <div className="form-group">
                <label>JIRA Issue Type</label>
                <select value={form.jiraIssueType} onChange={(e) => set('jiraIssueType', e.target.value)}>
                  <option>Task</option>
                  <option>Story</option>
                  <option>Bug</option>
                  <option>Epic</option>
                </select>
              </div>
              <div className="form-group">
                <label>Sync Direction</label>
                <select value={form.syncDirection} onChange={(e) => set('syncDirection', e.target.value)}>
                  <option value="BIDIRECTIONAL">↔ Bidirectional</option>
                  <option value="SF_TO_JIRA">→ Salesforce to JIRA</option>
                  <option value="JIRA_TO_SF">← JIRA to Salesforce</option>
                </select>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="card-title">Filters (optional)</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Salesforce Filter (SOQL WHERE)</label>
                <input value={form.filters?.salesforce || ''} onChange={(e) => setFilter('salesforce', e.target.value)} placeholder="e.g. Status = 'Open'" />
              </div>
              <div className="form-group">
                <label>JIRA Filter (JQL)</label>
                <input value={form.filters?.jira || ''} onChange={(e) => setFilter('jira', e.target.value)} placeholder="e.g. labels = 'priority'" />
              </div>
            </div>
          </div>

          {/* Field Mappings */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Field Mappings</div>
              <button className="btn btn-ghost btn-sm" onClick={addMapping}>+ Add</button>
            </div>
            {form.fieldMappings.map((m, i) => (
              <div key={i} className="mapping-row">
                <input value={m.salesforceField} onChange={(e) => updateMapping(i, 'salesforceField', e.target.value)} placeholder="SF Field" />
                <div className="mapping-arrow">→</div>
                <input value={m.jiraField} onChange={(e) => updateMapping(i, 'jiraField', e.target.value)} placeholder="JIRA Field" />
                <button className="mapping-remove" onClick={() => removeMapping(i)}>×</button>
              </div>
            ))}
          </div>

          {/* Status Mappings */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Status Mappings</div>
              <button className="btn btn-ghost btn-sm" onClick={addStatusMapping}>+ Add</button>
            </div>
            {form.statusMappings?.map((m, i) => (
              <div key={i} className="mapping-row">
                <input value={m.salesforceStatus} onChange={(e) => updateStatusMapping(i, 'salesforceStatus', e.target.value)} placeholder="SF Status" />
                <div className="mapping-arrow">↔</div>
                <input value={m.jiraStatus} onChange={(e) => updateStatusMapping(i, 'jiraStatus', e.target.value)} placeholder="JIRA Status" />
                <button className="mapping-remove" onClick={() => removeStatusMapping(i)}>×</button>
              </div>
            ))}
          </div>

          {/* Agent Rules */}
          <div>
            <div className="card-title">Agent Rules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {RULE_LABELS.map(({ key, label, desc }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #1f2937',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#5a6478', marginTop: 2 }}>{desc}</div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={form.rules?.[key] !== false}
                      onChange={(e) => setRule(key, e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              ))}
            </div>
            {form.rules?.escalation !== false && (
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>Escalation Threshold (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={form.rules?.escalationThresholdHours ?? 48}
                  onChange={(e) =>
                    setRule('escalationThresholdHours', parseInt(e.target.value, 10))
                  }
                />
              </div>
            )}
            {form.rules?.caseCountEscalation !== false && (
              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                <div className="form-group">
                  <label>Case Threshold</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={form.rules?.caseCountThreshold ?? 10}
                    onChange={(e) =>
                      setRule('caseCountThreshold', parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Target Priority</label>
                  <select
                    value={form.rules?.caseCountPriority ?? 'P1'}
                    onChange={(e) => setRule('caseCountPriority', e.target.value)}
                  >
                    <option value="P1">P1 (High)</option>
                    <option value="P0">P0 (Highest)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            {saving ? 'Saving…' : 'Save Config'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Configurations() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | configObj
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await configAPI.getAll();
      setConfigs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    try {
      await configAPI.toggle(id);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteConfig = async (id) => {
    if (!window.confirm('Delete this configuration?')) return;
    setDeleting(id);
    try {
      await configAPI.delete(id);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const dirLabel = (d) => ({ SF_TO_JIRA: 'SF → JIRA', JIRA_TO_SF: 'JIRA → SF', BIDIRECTIONAL: '↔ Bi-directional' }[d] || d);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Configurations</div>
          <div className="page-subtitle">Define sync rules between Salesforce and JIRA</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>+ New Config</button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : configs.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">⚙</div>
              <div className="empty-text">No configurations yet. Create one to start syncing.</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('new')}>+ New Config</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {configs.map((c) => (
              <div key={c._id} className="card" style={{ borderColor: c.isActive ? 'rgba(16,185,129,0.15)' : 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ fontFamily: 'Space Mono', fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                      <span className={`badge ${c.isActive ? 'badge-green' : 'badge-gray'}`}>
                        <span className={`dot ${c.isActive ? 'pulse' : ''}`} />{c.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, color: '#8b95a8' }}>
                        <span style={{ color: '#5a6478' }}>Object: </span>
                        <span style={{ fontFamily: 'Space Mono', color: '#00a1e0' }}>{c.salesforceObjectType}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b95a8' }}>
                        <span style={{ color: '#5a6478' }}>Project: </span>
                        <span style={{ fontFamily: 'Space Mono', color: '#0052cc' }}>{c.jiraProjectKey}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b95a8' }}>
                        <span style={{ color: '#5a6478' }}>Direction: </span>
                        <span style={{ fontFamily: 'Space Mono', color: '#8b5cf6' }}>{dirLabel(c.syncDirection)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b95a8' }}>
                        <span style={{ color: '#5a6478' }}>Interval: </span>
                        <span style={{ fontFamily: 'Space Mono' }}>every {c.syncIntervalMinutes}m</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b95a8' }}>
                        <span style={{ color: '#5a6478' }}>Mappings: </span>
                        <span style={{ fontFamily: 'Space Mono' }}>{c.fieldMappings?.length || 0} fields</span>
                      </div>
                    </div>
                    {/* Rule chips */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {RULE_LABELS.map(({ key, label }) => {
                        const on = c.rules?.[key] !== false;
                        return (
                          <span
                            key={key}
                            className={`badge ${on ? 'badge-green' : 'badge-gray'}`}
                            style={{ fontSize: 10, opacity: on ? 1 : 0.5 }}
                          >
                            {on ? '✓' : '✕'} {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
                    <label className="toggle" title={c.isActive ? 'Pause' : 'Activate'}>
                      <input type="checkbox" checked={c.isActive} onChange={() => toggle(c._id)} />
                      <span className="toggle-slider" />
                    </label>
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal(c)}>Edit</button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteConfig(c._id)}
                      disabled={deleting === c._id}
                    >
                      {deleting === c._id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <ConfigModal
          config={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
