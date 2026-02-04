# ServerManager

A web-based server management system with agent-based architecture for centrally managing Linux and Windows servers.

## Features

- **Server Management** - Add, edit, delete, and group Linux & Windows servers
- **Real-time Monitoring** - CPU, RAM, disk, network, process metrics with historical charts
- **SSH Terminal** - Web-based SSH terminal (xterm.js) for Linux servers
- **RDP Support** - RDP file download for Windows servers
- **Package Management** - View installed packages, check for updates, install updates
- **Log Viewer** - View system logs with search, filtering, and auto-refresh
- **Task Scheduler** - Cron-based tasks for updates, reboots, and custom scripts
- **Documentation** - Per-server documentation with versioning and file attachments
- **User Management** - Role-based access (Admin/User/ReadOnly) with server assignments
- **IP Overview** - Centralized IP address management with CSV export
- **2FA Support** - Optional TOTP two-factor authentication
- **Dark/Light Theme** - User-configurable theme toggle
- **Real-time Updates** - WebSocket-based live data via Socket.io

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js (Express) |
| Frontend | React + Tailwind CSS |
| Database | PostgreSQL |
| Real-time | Socket.io (WebSockets) |
| Auth | JWT + bcrypt + TOTP |
| SSH | ssh2 + xterm.js |
| Charts | Chart.js |
| Agents | Python (psutil) |

## Project Structure

```
/backend          Node.js API server
  /src
    /config       Configuration files
    /controllers  Route handlers
    /middleware    Auth, validation
    /routes       API route definitions
    /services     Business logic (encryption, logging)
    /websocket    Socket.io handlers
    /scripts      Utility scripts
  /migrations     Database migrations (Knex.js)
/frontend         React SPA
  /src
    /components   Reusable UI components
    /pages        Page components
    /services     API client, WebSocket
    /store        State management (Zustand)
/agents
  /linux          Python agent for Linux
  /windows        Python agent for Windows
/installer        Installation script
/database         Schema documentation
```

## Quick Start

### One-Click Installation (Debian/Ubuntu)

```bash
git clone https://github.com/your-repo/servermanager.git
cd servermanager
sudo bash installer/install.sh
```

The installer will:
1. Install Node.js, PostgreSQL, and Nginx
2. Configure the database
3. Build and deploy the application
4. Create a default admin user
5. Set up systemd services
6. Optionally configure SSL via Let's Encrypt

### Manual Installation

#### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Nginx (recommended)

#### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials and secrets
npm install
npx knex migrate:latest --knexfile src/config/knexfile.js
node src/scripts/createAdmin.js admin admin@example.com yourpassword
npm start
```

#### Frontend

```bash
cd frontend
npm install
npm run dev      # Development
npm run build    # Production build
```

### Agent Installation

#### Linux Agent

```bash
cd agents/linux
sudo bash agent_install.sh
```

You will be prompted for:
- Management Server URL
- Agent API Key (from server detail page)

#### Windows Agent

Run PowerShell as Administrator:
```powershell
cd agents\windows
.\install_agent.ps1 -ServerUrl "https://your-server.com" -ApiKey "your-api-key"
```

## API Documentation

### Authentication

All API endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

#### Login
```
POST /api/auth/login
Body: { "username": "admin", "password": "password" }
Response: { "accessToken": "...", "refreshToken": "...", "user": {...} }
```

#### Refresh Token
```
POST /api/auth/refresh
Body: { "refreshToken": "..." }
```

### Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List servers |
| GET | `/api/servers/:id` | Get server details |
| POST | `/api/servers` | Create server (Admin) |
| PUT | `/api/servers/:id` | Update server (Admin) |
| DELETE | `/api/servers/:id` | Delete server (Admin) |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:id/metrics/current` | Current metrics |
| GET | `/api/servers/:id/metrics/history?period=24h` | Historical metrics |

### Packages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:id/packages` | List packages |
| POST | `/api/servers/:id/packages/update` | Request updates |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:id/tasks` | List tasks |
| POST | `/api/servers/:id/tasks` | Create task |
| PUT | `/api/servers/:id/tasks/:taskId` | Update task |
| DELETE | `/api/servers/:id/tasks/:taskId` | Delete task |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:id/documents` | List documents |
| POST | `/api/servers/:id/documents` | Create document |
| PUT | `/api/servers/:id/documents/:docId` | Update document |

### Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### Agent Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/agent/metrics` | API Key | Submit metrics |
| POST | `/api/agent/heartbeat` | API Key | Agent heartbeat |
| POST | `/api/agent/packages/sync` | API Key | Sync packages |
| POST | `/api/agent/tasks/result` | API Key | Report task result |

Agent endpoints authenticate via `X-Agent-API-Key` header.

## Security

- Password hashing with bcrypt (12 rounds)
- JWT with refresh token rotation
- Encrypted credential storage (AES-256)
- Rate limiting on API and login endpoints
- CSRF protection via SameSite cookies
- Helmet.js security headers
- SQL injection prevention (parameterized queries via Knex)
- XSS prevention (React DOM escaping)
- Optional 2FA (TOTP)

## User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access: manage servers, users, tasks |
| User | Manage assigned servers: terminal, packages, tasks, docs |
| ReadOnly | View assigned servers: monitoring, logs, docs |

## Configuration

All configuration is via environment variables in `backend/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 3000 |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_NAME` | Database name | servermanager |
| `JWT_SECRET` | JWT signing secret | - |
| `ENCRYPTION_KEY` | Credential encryption key | - |

See `backend/.env.example` for all options.

## License

MIT License - see [LICENSE](LICENSE) for details.
