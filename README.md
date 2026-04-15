# Salesforce ↔ JIRA Sync Agent (MERN Stack)

A full-stack MERN application that automatically keeps Salesforce records and JIRA issues in sync. The agent runs on a configurable schedule and supports bidirectional sync with field mappings, status mappings, and filters.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Frontend (React)                   │
│  Dashboard · Connections · Config · Records     │
│              Logs · Live Charts                 │
└────────────────────┬────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────┐
│             Backend (Express + Node)            │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ SF Svc   │  │ JIRA Svc │  │  Sync Engine  │ │
│  │ (jsforce)│  │  (axios) │  │   (cron)      │ │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘ │
└───────┼─────────────┼────────────────┼──────────┘
        │             │                │
┌───────▼─────────────▼────────────────▼──────────┐
│                  MongoDB                        │
│   SyncRecord · SyncLog · SyncConfig             │
└─────────────────────────────────────────────────┘
        │                         │
  Salesforce Org           JIRA / Atlassian
```

---

## Project Structure

```
salesforce-jira-sync/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express app + scheduler
│   │   ├── models/index.js        # Mongoose models
│   │   ├── routes/
│   │   │   ├── sync.js            # /api/sync/*
│   │   │   ├── configs.js         # /api/configs/*
│   │   │   └── connections.js     # /api/connections/*
│   │   ├── services/
│   │   │   ├── salesforceService.js
│   │   │   ├── jiraService.js
│   │   │   ├── syncEngine.js      # Core sync logic
│   │   │   └── syncWorker.js      # Standalone cron worker
│   │   └── utils/logger.js
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.js                 # Router + sidebar
│   │   ├── styles.css             # Global dark theme
│   │   ├── services/api.js        # Axios API client
│   │   └── pages/
│   │       ├── Dashboard.js       # Live stats + charts
│   │       ├── Connections.js     # SF + JIRA status
│   │       ├── Configurations.js  # CRUD sync configs
│   │       ├── SyncRecords.js     # Linked record pairs
│   │       └── SyncLogs.js        # Sync audit history
│   ├── public/index.html
│   ├── .env.example
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
└── docker-compose.yml
```

---

## Quick Start

### 1. Clone & Configure

```bash
git clone <repo>
cd salesforce-jira-sync

# Backend config
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials
```

### 2. Salesforce Setup

1. Create a **Connected App** in Salesforce Setup
2. Enable OAuth, note the Client ID & Secret
3. Reset your **Security Token** (Profile → Reset Security Token)
4. Fill in `backend/.env`:

```env
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_USERNAME=you@yourorg.com
SALESFORCE_PASSWORD=yourpassword
SALESFORCE_SECURITY_TOKEN=yourtoken
```

### 3. JIRA Setup

1. Go to **Atlassian Account Settings** → Security → **API Tokens**
2. Create a new token
3. Fill in `backend/.env`:

```env
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your_api_token
JIRA_PROJECT_KEY=PROJ
```

### 4. Run (Development)

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm start
```

App: http://localhost:3000  
API: http://localhost:5000

### 5. Run (Docker)

```bash
docker-compose up --build
```

---

## Configuration Guide

### Creating a Sync Configuration

In the **Config** page, create a new configuration with:

| Field | Description |
|-------|-------------|
| Name | Human-readable name |
| SF Object Type | Case, Opportunity, Lead, or Task |
| JIRA Project Key | e.g. `PROJ` |
| JIRA Issue Type | Task, Story, Bug, Epic |
| Sync Direction | Bidirectional, SF→JIRA, or JIRA→SF |
| Sync Interval | How often to poll (minutes) |
| Field Mappings | Map SF fields to JIRA fields |
| Status Mappings | Map SF statuses to JIRA statuses |
| Filters | SOQL / JQL filters to scope records |

### Default Field Mappings (Case)

| Salesforce Field | JIRA Field |
|-----------------|------------|
| Subject | summary |
| Description | description |
| Priority | priority |
| Status | _status (transition) |

### Special Field Keys

- `_status` — triggers a JIRA status transition (via status mappings)
- `priority` — maps SF priority to JIRA priority levels

---

## API Reference

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/status` | Agent status & stats |
| POST | `/api/sync/trigger` | Manually trigger sync |
| GET | `/api/sync/logs` | Sync logs (paginated) |
| GET | `/api/sync/records` | Linked record pairs |
| DELETE | `/api/sync/records/:id` | Unlink a pair |
| GET | `/api/sync/stats` | Dashboard statistics |

### Configurations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/configs` | All configurations |
| POST | `/api/configs` | Create configuration |
| PUT | `/api/configs/:id` | Update configuration |
| DELETE | `/api/configs/:id` | Delete configuration |
| PATCH | `/api/configs/:id/toggle` | Enable/disable |

### Connections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/connections/salesforce` | SF connection status |
| GET | `/api/connections/jira` | JIRA connection status |
| GET | `/api/connections/jira/projects` | Available JIRA projects |
| POST | `/api/connections/test-all` | Test both connections |

---

## How It Works

1. **Scheduler** runs every N minutes (configurable per config)
2. **SyncEngine** fetches recently modified SF records via SOQL
3. For each record, it checks if a `SyncRecord` already exists in MongoDB
4. If **new**: creates a JIRA issue and saves the link in MongoDB
5. If **existing**: compares MD5 hash; if changed, updates the JIRA issue
6. For **JIRA→SF**: fetches recently updated JIRA issues with `salesforce-sync` label, updates the linked SF record
7. All operations are logged to `SyncLog` in MongoDB

---

## Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/salesforce_jira_sync
PORT=5000
NODE_ENV=development

# Salesforce
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_USERNAME=
SALESFORCE_PASSWORD=
SALESFORCE_SECURITY_TOKEN=

# JIRA
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=PROJ

# Sync
SYNC_INTERVAL_MINUTES=5
FRONTEND_URL=http://localhost:3000
```
