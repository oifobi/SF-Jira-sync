import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard      from './pages/Dashboard';
import SyncRecords    from './pages/SyncRecords';
import SyncLogs       from './pages/SyncLogs';
import Configurations from './pages/Configurations';
import Connections    from './pages/Connections';
import { syncAPI }    from './services/api';
import './styles.css';

function Sidebar({ escalatedCount }) {
  const NAV_ITEMS = [
    { to: '/',               label: 'Dashboard',    icon: '◈', end: true },
    { to: '/connections',    label: 'Connections',  icon: '⬡' },
    { to: '/configurations', label: 'Config',       icon: '⚙' },
    { to: '/records',        label: 'Records',      icon: '≋', badge: escalatedCount > 0 ? escalatedCount : null },
    { to: '/logs',           label: 'Logs',         icon: '▦' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon">⟲</span>
        <div>
          <div className="brand-title">SyncAgent</div>
          <div className="brand-sub">SF ↔ JIRA</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge != null && (
              <span
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '100px',
                  fontSize: 10,
                  fontFamily: 'Space Mono',
                  fontWeight: 700,
                  padding: '1px 6px',
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Rules summary in sidebar footer */}
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8 }}>
          {escalatedCount > 0 && (
            <div
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 10, fontFamily: 'Space Mono', color: '#ef4444', fontWeight: 700 }}>
                ⚠ {escalatedCount} ESCALATED
              </div>
              <div style={{ fontSize: 10, color: '#8b95a8', marginTop: 2 }}>
                Open &gt;48h, no progress
              </div>
            </div>
          )}
        </div>
        <div className="version-badge">v1.0.0</div>
      </div>
    </aside>
  );
}

const isDemoMode = process.env.REACT_APP_DEMO_MODE === 'true';

export default function App() {
  const [escalatedCount, setEscalatedCount] = useState(0);

  useEffect(() => {
    const fetchEscalated = async () => {
      try {
        const stats = await syncAPI.getStats();
        setEscalatedCount(stats?.records?.escalated || 0);
      } catch {}
    };
    fetchEscalated();
    const id = setInterval(fetchEscalated, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <BrowserRouter>
      <div className="app-shell" style={{ flexDirection: 'column' }}>
        {isDemoMode && (
          <div className="demo-banner">
            <span className="demo-badge">DEMO</span>
            This is a demonstration with sample data — no real Salesforce or JIRA credentials required. OBI well done!
          </div>
        )}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar escalatedCount={escalatedCount} />
          <main className="main-content">
            <Routes>
              <Route path="/"               element={<Dashboard />} />
              <Route path="/connections"    element={<Connections />} />
              <Route path="/configurations" element={<Configurations />} />
              <Route path="/records"        element={<SyncRecords />} />
              <Route path="/logs"           element={<SyncLogs />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
