# BildyApp API

Full backend for digital delivery note management. REST API built with Node.js and Express for managing clients, projects and delivery notes (hours or materials) with digital signature, PDF generation and cloud storage.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933)
![Express](https://img.shields.io/badge/Express-5-000000)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248)
![Jest](https://img.shields.io/badge/Tests-Jest%20%2B%20Supertest-C21325)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| Database | MongoDB + Mongoose |
| Validation | Zod |
| Authentication | JWT + bcryptjs |
| File uploads | Multer + Cloudinary |
| Image processing | Sharp |
| PDF generation | pdfkit |
| Email | Nodemailer + Mailtrap |
| Documentation | Swagger / OpenAPI 3.0 |
| Testing | Jest + Supertest + mongodb-memory-server |
| Notifications | Slack Incoming Webhooks (5XX errors) |
| Security | Helmet + rate limiting + mongo-sanitize |
| Containers | Docker + Docker Compose |
| Real-time | Socket.IO (WebSockets) |
| CI/CD | GitHub Actions |

## Installation

1. Clone the repository and install dependencies:

        git clone https://github.com/LinoVives16/bildy-api.git
        cd bildy-api
        npm install

2. Set up environment variables:

        cp .env.example .env

   Fill in the variables in `.env` (see Environment Variables section).

3. Start the server:

        npm run dev    # development (auto-restart on changes)

## Running with Docker

Start the app together with MongoDB in one command:

        docker compose up --build

The API will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | Environment (`development` / `test` / `production`) |
| `MONGO_URL` | MongoDB connection URI |
| `JWT_SECRET` | Secret key for signing JWTs |
| `JWT_EXPIRES_IN` | Access token duration (e.g. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token duration (e.g. `7d`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `SLACK_WEBHOOK` | Slack Incoming Webhook URL |
| `MAIL_HOST` | SMTP host (e.g. `sandbox.smtp.mailtrap.io`) |
| `MAIL_PORT` | SMTP port (e.g. `2525`) |
| `MAIL_USER` | SMTP username |
| `MAIL_PASS` | SMTP password |

## Running Tests

        npm test              # run all tests
        npm run test:watch    # watch mode
        npm run test:coverage # with coverage report

Tests use `mongodb-memory-server` (in-memory database) and do not require a real MongoDB connection or any external services.

Current coverage: **~87% statements / ~88% lines** (129+ tests).

## Swagger Docs

With the server running, access the interactive UI at:

        http://localhost:3000/api-docs

## Health Check

        GET /health

Returns server status, MongoDB connection state and process uptime.

## API Endpoints

### Users

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/user/register` | Register user (sends verification code by email) | — |
| PUT | `/api/user/validation` | Validate email with 6-digit code | JWT |
| POST | `/api/user/login` | Login — returns access + refresh token | — |
| PUT | `/api/user/register` | Update personal data | JWT |
| PATCH | `/api/user/company` | Create or join a company | JWT |
| PATCH | `/api/user/logo` | Upload company logo | JWT |
| GET | `/api/user` | Get authenticated user profile | JWT |
| PUT | `/api/user/password` | Change password | JWT |
| POST | `/api/user/refresh` | Renew access token | — |
| POST | `/api/user/logout` | Log out | JWT |
| DELETE | `/api/user` | Delete user (`?soft=true` to archive) | JWT |
| POST | `/api/user/invite` | Invite user to the company (admin only) | JWT |

### Clients

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/client` | Create client | JWT |
| PUT | `/api/client/:id` | Update client | JWT |
| GET | `/api/client` | List clients (`?page`, `?limit`, `?name`, `?sort`) | JWT |
| GET | `/api/client/:id` | Get client by ID | JWT |
| DELETE | `/api/client/:id` | Delete (`?soft=true` to archive) | JWT |
| GET | `/api/client/archived` | List archived clients | JWT |
| PATCH | `/api/client/:id/restore` | Restore archived client | JWT |

### Projects

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/project` | Create project | JWT |
| PUT | `/api/project/:id` | Update project | JWT |
| GET | `/api/project` | List projects (`?page`, `?limit`, `?client`, `?name`, `?active`, `?sort`) | JWT |
| GET | `/api/project/:id` | Get project by ID | JWT |
| DELETE | `/api/project/:id` | Delete (`?soft=true` to archive) | JWT |
| GET | `/api/project/archived` | List archived projects | JWT |
| PATCH | `/api/project/:id/restore` | Restore archived project | JWT |

### Delivery Notes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/deliverynote` | Create delivery note (hours or material) | JWT |
| GET | `/api/deliverynote` | List delivery notes (`?page`, `?limit`, `?project`, `?client`, `?format`, `?signed`, `?from`, `?to`, `?sort`) | JWT |
| GET | `/api/deliverynote/:id` | Get delivery note with populated data | JWT |
| GET | `/api/deliverynote/pdf/:id` | Download delivery note as PDF | JWT |
| PATCH | `/api/deliverynote/:id/sign` | Sign delivery note (uploads signature to Cloudinary and generates PDF) | JWT |
| DELETE | `/api/deliverynote/:id` | Delete delivery note (only if unsigned) | JWT |

## Real-time Events (Socket.IO)

The server emits WebSocket events so connected clients receive updates instantly without polling.

**Connecting:**

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: '<your JWT access token>' }
});
```

The connection requires a valid JWT token. Each client is automatically joined to a room identified by their `company._id`, so events are only received by users of the same company.

### Testing WebSocket Events (Socket.IO)

REST clients like Bruno or the REST Client extension cannot test WebSocket connections since they only handle HTTP. To test real-time events, connect directly using the Socket.IO client library.
From a Node.js script:
jsimport { io } from 'socket.io-client';

Paso 1 - cargar el script (tu servidor lo sirve automáticamente):
```js

const script = document.createElement('script');
script.src = 'http://localhost:3000/socket.io/socket.io.js';
document.head.appendChild(script);
```
  Espera 1 segundo a que cargue, luego:
```js
Paso 2 — conectar y escuchar:
const socket = io('http://localhost:3000', {
auth: { token: 'PEGA_AQUI_TU_JWT_REAL' } 
});

socket.on('connect', () => console.log('Conectado:', socket.id));
socket.on('connect_error', (err) => console.log('Error:', err.message));
socket.on('client:new', (data) => console.log('Nuevo cliente:', data));
socket.on('project:new', (data) => console.log('Nuevo proyecto:', data));
socket.on('deliverynote:new', (data) => console.log('Nuevo albarán:', data));
socket.on('deliverynote:signed', (data) => console.log('Albarán firmado:', data));
```

A valid JWT token is required on every connection. Once authenticated, the client is automatically joined to a room scoped to its company, so events are only received by users belonging to the same organization.

**Events:**

| Event | Triggered when |
|-------|----------------|
| `client:new` | A new client is created |
| `project:new` | A new project is created |
| `deliverynote:new` | A new delivery note is created |
| `deliverynote:signed` | A delivery note is signed |

**Example:**

```js
socket.on('deliverynote:signed', (data) => {
  console.log('Delivery note signed:', data);
});
```

## Testing with api.http

The `api.http` file includes examples for all endpoints with variables that capture tokens automatically.

1. Run `Register` — the verification code is sent to the configured email.
2. Paste the code into `Validation`.
3. Run `Login` — updates `{{login_token}}` and `{{refresh_token}}` automatically.
4. All subsequent requests use the saved tokens without manual copying.
