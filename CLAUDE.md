# Claude Code Guidelines for Salesforce ↔ JIRA Sync

## Project Overview

This is a MERN stack application that syncs records between Salesforce and JIRA on a configurable schedule. The system includes a backend sync engine, frontend dashboard, MongoDB for persistence, and integrations with Salesforce (jsforce) and JIRA (REST API).

## Key Architecture

- **Frontend** (React): Dashboard, connections, configurations, sync records, logs
- **Backend** (Express/Node): REST API, sync engine, cron scheduler, service integrations
- **Database** (MongoDB): SyncRecord, SyncLog, SyncConfig models
- **External APIs**: Salesforce (jsforce), JIRA (axios REST calls)

## Code Organization

```
backend/src/
├── server.js              # Express setup, scheduler initialization
├── models/index.js        # Mongoose schemas
├── routes/                # API endpoints (sync, configs, connections)
├── services/              # Business logic (salesforceService, jiraService, syncEngine, syncWorker)
└── utils/logger.js        # Winston logging

frontend/src/
├── App.js                 # Main router and layout
├── services/api.js        # Axios API client
├── styles.css             # Dark theme styles
└── pages/                 # React components (Dashboard, Configurations, etc.)
```

## Development Workflow

1. **Backend development**: `cd backend && npm run dev`
2. **Frontend development**: `cd frontend && npm start`
3. **Run both with Docker**: `docker-compose up --build`
4. **Database**: MongoDB (local or containerized)

## Common Tasks

### Adding a New Sync Configuration Field
- Update the `SyncConfig` model in `backend/src/models/index.js`
- Add form input in `frontend/src/pages/Configurations.js`
- Update the sync logic in `backend/src/services/syncEngine.js` if needed
- Update the API validation in `backend/src/routes/configs.js`

### Debugging Sync Issues
- Check `SyncLog` collection in MongoDB for detailed error messages
- Review `backend/logs/combined.log` and `backend/logs/error.log`
- Use the sync status and logs endpoints (`/api/sync/status`, `/api/sync/logs`)
- Verify Salesforce and JIRA credentials in `.env`

### Adding New External Integration
- Create a new service in `backend/src/services/` (e.g., `serviceXService.js`)
- Add connection test in `backend/src/routes/connections.js`
- Update frontend connection status display in `frontend/src/pages/Connections.js`

## Important Considerations

### Environment & Credentials
- `.env` files contain sensitive data — never commit them
- Always use `.env.example` as reference for required variables
- Test integrations with `/api/connections/test-all` before debugging sync issues

### Bidirectional Sync Complexity
- Pay attention to sync direction (SF→JIRA, JIRA→SF, or bidirectional)
- Status mappings are critical for transitions; test carefully
- The system uses MD5 hashing to detect changes — modifications to hash logic affect all syncs

### Field Mappings
- Special keys: `_status` triggers status transitions, `priority` has custom mapping
- Invalid field mappings will cause sync failures — validate early
- JIRA custom fields require the full field key (e.g., `customfield_10001`)

### Logging
- All sync operations are logged to `SyncLog` collection and files
- Winston logger handles console, file, and database outputs
- Check logs when troubleshooting sync failures

## Testing Approach

1. **Unit**: Test services and utils in isolation
2. **Integration**: Test sync engine with mock or test Salesforce/JIRA data
3. **Manual**: Use the UI to create configs and trigger syncs, verify in both systems
4. **Error cases**: Test invalid credentials, missing fields, API failures

## Git Workflow

- Branch off `main` for features/fixes
- Commit messages should reference the change (e.g., "Add support for X field")
- Test locally before pushing
- Do not commit `.env`, `node_modules`, or log files

## Questions to Ask Before Implementing

- Which direction is this sync? (bidirectional changes are risky)
- Are custom fields involved? (require special handling in JIRA)
- Does this affect multiple sync configurations? (test all, not just one)
- What happens on edge cases? (missing fields, API timeouts, etc.)
