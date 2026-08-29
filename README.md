# ✉️ Letter Management System (LMS)

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19.0-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC.svg)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791.svg)](https://www.postgresql.org/)

A modern, enterprise-grade **Letter Management System** built for the **Sidama Innovation and Technology Agency (SITA)**. This system digitizes official letter registration, routing, tracking, review, approval, dispatch, and archival operations across organization directorates.

---

## 📑 Table of Contents

- [Overview & Purpose](#-overview--purpose)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Key Features](#-key-features)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [Workflows](#-workflows)
- [Admin Task System](#-admin-task-system)
- [Notification System](#-notification-system)
- [Demo Credentials](#-demo-credentials)
- [Repository Structure](#-repository-structure)
- [Installation & Setup](#-installation--setup)
- [API Reference](#-api-reference)
- [Database](#-database)
- [Security](#-security)

---

## 🎯 Overview & Purpose

The **Letter Management System (LMS)** provides SITA with an end-to-end digital correspondence platform. Key objectives:

- **Centralized Letter Registry**: Register incoming, outgoing, and internal letters with unique reference and registration numbers.
- **Auditable Letter Lifecycle**: Track letters through 17 distinct status stages from `RECEIVED` to `ARCHIVED`.
- **Workflow-Driven Task Management**: Backend automatically generates administrative tasks when workflow states require action.
- **Real-Time Notifications**: Workflow events trigger notifications to the correct users at each stage.
- **Hierarchical Sign-Offs**: Support structured approval processes managed by department managers.
- **Attachment Management**: Attach original scans, annexes, and supporting documentation with local file storage.
- **Governance & Auditability**: Maintain full audit logs of every registration, routing, approval, dispatch, and archival action.

---

## 🏗️ System Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│             Letter Management System SPA                         │
│             (React 19 + Vite 6 + Tailwind CSS v4)                │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ HTTP / REST API (JWT Bearer)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Express API Server                             │
│               (Node.js + TypeScript - Port 5000)                 │
│                                                                  │
│  ├─ Auth Middleware (JWT Verification)                           │
│  ├─ RBAC Guards (ADMIN, DEPARTMENT_MANAGER,                      │
│  │                REGISTRY_OFFICER, EMPLOYEE)                     │
│  ├─ Workflow Engine (task generation, notifications)             │
│  ├─ Input Validation & Upload Parsing (Multer)                   │
│  └─ Security (Helmet, CORS, Rate Limiting)                       │
└───────────────┬────────────────────────────────┬─────────────────┘
                │ Direct SQL (pg pool)           │ File System
                ▼                                ▼
┌────────────────────────────────┐  ┌──────────────────────────────┐
│       PostgreSQL Database       │  │       Local File Storage     │
│  - users, departments          │  │  - uploads/documents/        │
│  - documents (letters)         │  │  - Uploaded attachments      │
│  - approvals, comments         │  └──────────────────────────────┘
│  - admin_tasks                 │
│  - notifications               │
│  - audit_logs                  │
└────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### **Frontend** (`letter-frontend`)
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework with hooks and context |
| TypeScript 5.7 | Type-safe development |
| Vite 6 | Build tool and dev server |
| React Router v7 | Client-side routing |
| Tailwind CSS v4 | Utility-first styling (SITA palette) |
| Lucide React | Icon library |
| Axios | HTTP client with JWT interceptors |
| PDF.js | Document preview and viewing |

### **Backend** (`letter-backend`)
| Technology | Purpose |
|------------|---------|
| Node.js 20+ | Runtime environment |
| TypeScript 5.7 | Type-safe development |
| Express 4 | HTTP server framework |
| pg (PostgreSQL) | Database connection pool |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT token generation/verification |
| multer | File upload handling |
| zod | Input validation |
| helmet | Security headers |
| express-rate-limit | API rate limiting |

---

## ✨ Key Features

### 📥 1. Letter Management
- **Three Letter Types**: Incoming, Outgoing, Internal (Memos)
- **17 Workflow Statuses**: `RECEIVED` → `REGISTERED` → `ROUTED` → `ASSIGNED` → `IN_PROGRESS` → `PENDING_REVIEW` → `PENDING_APPROVAL` → `APPROVED` → `REJECTED` → `CHANGES_REQUESTED` → `READY_FOR_DISPATCH` → `DISPATCHED` → `DELIVERED` → `RESPONSE_REQUIRED` → `COMPLETED` → `ARCHIVED`
- **Reference Numbers**: Auto-generated `IN/YYYY/NNNNN`, `OUT/YYYY/NNNNN`, `INT/YYYY/NNNNN`
- **Priority Levels**: URGENT, HIGH, NORMAL, LOW
- **Confidentiality**: PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED
- **Due Dates & SLA**: Track deadlines and overdue items
- **Response Linking**: Link outgoing responses to original incoming letters

### 📋 2. Workflow & Task Management
- **Workflow-Driven Tasks**: Backend automatically creates administrative tasks when workflow reaches states requiring action
- **Task Types**: `ROUTE_INCOMING`, `REGISTER_OUTGOING`, `REGISTER_INTERNAL`, `ROUTE_INTERNAL`, `RESPONSE_REVIEW`, and more
- **Task Lifecycle**: PENDING → IN_PROGRESS → CLAIMED → COMPLETED/CANCELLED/EXPIRED
- **Multiple Administrator Support**: Task claiming prevents concurrent processing
- **Idempotency**: Duplicate tasks prevented via database constraints
- **Transaction Safety**: Task completion tied to successful business actions

### 🔔 3. Notification System
- **21 Notification Types**: From `LETTER_RECEIVED` to `WORKFLOW_ESCALATED`
- **Workflow-Triggered**: Notifications generated automatically on business events
- **Duplicate Prevention**: Idempotency keys prevent duplicate notifications
- **Persistent Read State**: Track read/unread with timestamps
- **Priority Levels**: LOW, NORMAL, HIGH, URGENT
- **Filtering & Search**: Filter by type, read status, date range, letter, task

### 👥 4. Role-Based Access Control (RBAC)

| Role | Responsibilities |
|------|------------------|
| **ADMIN** | System administration, routes letters, registers outgoing, manages users & departments, views audit logs |
| **DEPARTMENT_MANAGER** | Reviews/approves outgoing drafts, assigns letters to officers, manages department inbox |
| **REGISTRY_OFFICER** | Registers incoming letters, records dispatch details, manages physical registry |
| **EMPLOYEE** | Executes assigned tasks, drafts responses, submits for approval |

### 📊 5. Dashboard & Analytics
- **Admin Dashboard**: Incoming routing queue, outgoing registration queue, overdue letters, system stats
- **Manager Dashboard**: Pending approvals, department in-progress, department overdue
- **Employee Dashboard**: Active assignments, due this week, saved drafts
- **Registry Dashboard**: Today's registrations, pending dispatch, dispatched this week

### 📝 6. Audit Logging
- **Immutable Logs**: Every action recorded with user, timestamp, previous/new status
- **Task Audit**: Task creation, claiming, completion, cancellation tracked
- **Letter Audit**: Full movement history with department transfers
- **Filterable**: Search by user, action, entity type, date range

### 💬 7. Collaboration
- **Letter Discussion**: Threaded comments per letter
- **Notifications**: Real-time alerts for assignments, approvals, status changes
- **Document Sharing**: Attach files with version tracking

---

## 🔄 Workflows

### Incoming Letter
```text
Registry Officer          Admin             Dept Manager        Officer
     │                      │                   │                  │
     ├── Register ──────────┤                   │                  │
     │   (RECEIVED→REGISTERED)                  │                  │
     │                      │                   │                  │
     │              Task: ROUTE_INCOMING        │                  │
     │              Notification: Admin         │                  │
     │                      │                   │                  │
     │                      ├── Route ──────────┤                  │
     │                      │   (REGISTERED→ASSIGNED)              │
     │                      │   Task: COMPLETED  │                  │
     │                      │   Notification: Manager              │
     │                      │                   │                  │
     │                      │                   ├── Assign ────────┤
     │                      │                   │   (ASSIGNED→IN_PROGRESS)
     │                      │                   │   Notification: Officer
     │                      │                   │                  │
     │                      │                   │                  ├── Process
     │                      │                   │                  │
     │                      │                   │                  ├── Complete
     │                      │                   │                  │   (IN_PROGRESS→COMPLETED)
     │                      │                   │   Notification: Author
```

### Outgoing Letter
```text
Officer              Dept Manager           Admin              Dispatch
   │                      │                   │                   │
   ├── Create Draft ──────┤                   │                   │
   │   (DRAFT)            │                   │                   │
   │                      │                   │                   │
   ├── Submit ────────────┤                   │                   │
   │   (DRAFT→PENDING_APPROVAL)               │                   │
   │   Notification: Manager                  │                   │
   │                      │                   │                   │
   │              Approve/Reject              │                   │
   │              (PENDING_APPROVAL→APPROVED)  │                   │
   │              Task: REGISTER_OUTGOING     │                   │
   │              Notification: Admin         │                   │
   │                      │                   │                   │
   │                      │       Register ───┤                   │
   │                      │       (APPROVED→REGISTERED)           │
   │                      │       Task: COMPLETED                 │
   │                      │       (REGISTERED→READY_FOR_DISPATCH) │
   │                      │       Notification: Dispatch          │
   │                      │                   │                   │
   │                      │                   │       Dispatch ───┤
   │                      │                   │   (READY_FOR_DISPATCH→DISPATCHED)
   │                      │                   │   Notification: Author
```

### Internal Letter
```text
Officer        Sending Manager      Admin         Receiving Manager    Receiving Officer
   │                │                 │                  │                    │
   ├── Create ──────┤                 │                  │                    │
   │                │                 │                  │                    │
   ├── Submit ──────┤                 │                  │                    │
   │   Notification: Manager          │                  │                    │
   │                │                 │                  │                    │
   │          Approve                 │                  │                    │
   │   Task: REGISTER_INTERNAL        │                  │                    │
   │   Notification: Admin            │                  │                    │
   │                │                 │                  │                    │
   │                │     Register & Route              │                    │
   │                │     Task: COMPLETED               │                    │
   │                │     Notification: Receiving Mgr   │                    │
   │                │                 │                  │                    │
   │                │                 │                  ├── Assign ──────────┤
   │                │                 │                  │   Notification: Officer
```

---

## 📋 Admin Task System

The backend maintains a dedicated `admin_tasks` table that tracks administrative actions required by the Main Administrator.

### Task Generation
Tasks are **automatically created** when workflow transitions reach states requiring administrator action:

| Workflow Event | Task Created | Priority |
|----------------|--------------|----------|
| Registry registers incoming letter | `ROUTE_INCOMING` | HIGH |
| Manager approves outgoing letter | `REGISTER_OUTGOING` | HIGH |
| Manager approves internal letter | `REGISTER_INTERNAL` | HIGH |
| Letter requires response | `RESPONSE_REVIEW` | HIGH |
| Task becomes overdue | `WORKFLOW_ESCALATION` | URGENT |

### Task Features
- **Idempotency**: Duplicate tasks prevented via unique constraints
- **Claiming**: Multiple administrators can claim tasks to prevent conflicts
- **Transaction Safety**: Task completion tied to successful business actions
- **SLA Tracking**: Due dates, overdue detection, escalation notifications
- **Audit Trail**: Every task lifecycle event logged

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks/my` | GET | Get current user's tasks with filtering |
| `/api/tasks/my/summary` | GET | Get task statistics |
| `/api/tasks/:id` | GET | Get task details |
| `/api/tasks/:id/claim` | POST | Claim a task |
| `/api/tasks/:id/start` | POST | Start working on task |
| `/api/tasks/:id/complete` | POST | Complete task |
| `/api/tasks/:id/cancel` | POST | Cancel task |
| `/api/tasks/escalate` | POST | Run overdue escalation |

---

## 🔔 Notification System

Notifications are generated automatically from backend business events.

### Notification Types
| Type | Trigger | Recipient |
|------|---------|-----------|
| `LETTER_REGISTERED` | Incoming letter registered | Admin |
| `LETTER_ROUTED` | Letter routed to department | Department Manager |
| `LETTER_ASSIGNED` | Letter assigned to officer | Officer |
| `LETTER_APPROVED` | Manager approves letter | Admin (for registration) |
| `CHANGES_REQUESTED` | Manager requests changes | Officer/Submitter |
| `DISPATCH_READY` | Letter registered & ready | Registry Officer |
| `LETTER_DISPATCHED` | Letter dispatched | Author |
| `LETTER_COMPLETED` | Letter workflow completed | Author |
| `LETTER_ARCHIVED` | Letter archived | Author |
| `TASK_ASSIGNED` | Admin task created | Admin |
| `TASK_COMPLETED` | Admin task completed | Admin |
| `TASK_OVERDUE` | Task becomes overdue | Admin |
| `DOCUMENT_SUBMITTED` | Letter submitted for approval | Department Manager |
| `COMMENT_ADDED` | New comment on letter | Letter Author |

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications` | GET | Get notifications with filtering |
| `/api/notifications/unread-count` | GET | Get unread count |
| `/api/notifications/types` | GET | Get available notification types |
| `/api/notifications/:id/read` | POST | Mark notification as read |
| `/api/notifications/read-all` | POST | Mark all as read |
| `/api/notifications/:id` | DELETE | Delete notification |

---

## 🔐 Security

- **JWT Authentication**: Bearer token-based authentication
- **RBAC Authorization**: Role-based access control on all endpoints
- **IDOR Protection**: Users can only access their own data
- **Transaction Safety**: Critical operations wrapped in database transactions
- **Row-Level Locking**: `SELECT FOR UPDATE` prevents concurrent modifications
- **Input Validation**: Server-side validation on all inputs
- **Rate Limiting**: API rate limiting to prevent abuse
- **Security Headers**: Helmet middleware for HTTP security headers
- **No Frontend Trust**: Backend derives user identity from JWT, never from request body

---

## 🔑 Demo Credentials

| Role | Email | Password | Primary Scope |
|------|-------|----------|---------------|
| **Admin** | `admin@sita.gov.et` | `Sita@2026` | Full system control, task management, user administration |
| **Department Manager** | `manager@sita.gov.et` | `Sita@2026` | Approval queue, department letters, officer assignment |
| **Registry Officer** | `registry@sita.gov.et` | `Sita@2026` | Letter registration, dispatch recording |
| **Employee** | `employee@sita.gov.et` | `Sita@2026` | Draft letters, execute assigned tasks |

---

## 📁 Repository Structure

```text
Letter-Management-System/
├── README.md
│
├── letter-backend/                    # Express REST API
│   ├── package.json
│   ├── tsconfig.json
│   ├── railway.toml                   # Railway deployment config
│   ├── scripts/
│   │   ├── migrate.ts                 # Database migration runner
│   │   └── seed.ts                    # Seed data script
│   ├── supabase/
│   │   └── migrations/                # SQL migration files
│   │       ├── 0001_initial.sql       # Core tables (users, departments, documents)
│   │       ├── 0002_postgres_auth.sql # Authentication setup
│   │       ├── 0003_letter_workflows.sql # Workflow statuses, audit logs
│   │       ├── 0004_registration_number.sql # Registration numbers
│   │       ├── 0005_registry_officer_role.sql # Registry officer role
│   │       ├── 0006_employee_letter_scope.sql # Employee letter scoping
│   │       ├── 0007_admin_tasks.sql   # Admin task management
│   │       └── 0008_notifications_upgrade.sql # Notification system upgrade
│   ├── uploads/                       # Local file storage
│   └── src/
│       ├── index.ts                   # Express app entry point
│       ├── config.ts                  # Environment configuration
│       ├── lib/
│       │   ├── db.ts                  # PostgreSQL connection pool + transactions
│       │   ├── errors.ts              # Error handling utilities
│       │   ├── jwt.ts                 # JWT token utilities
│       │   ├── utils.ts               # Serializers and helpers
│       │   ├── audit.ts               # Audit logging service
│       │   ├── notifications.ts       # Notification service (21 types)
│       │   └── tasks.ts               # Task service (workflow-driven)
│       ├── middleware/
│       │   ├── auth.ts                # JWT authentication + RBAC
│       │   └── errorHandler.ts        # Global error handler
│       └── routes/
│           ├── auth.routes.ts         # Login, register, me
│           ├── users.routes.ts        # User CRUD (admin)
│           ├── departments.routes.ts  # Department CRUD (admin)
│           ├── documents.routes.ts    # Letter CRUD + workflow actions
│           ├── approvals.routes.ts    # Approval queue + review actions
│           ├── comments.routes.ts     # Letter discussion
│           ├── notifications.routes.ts # Notification API
│           ├── dashboard.routes.ts    # Dashboard statistics
│           ├── tasks.routes.ts        # Admin task API
│           └── reports.routes.ts      # Reports
│
└── letter-frontend/                   # React SPA
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── vercel.json                    # Vercel deployment config
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── index.css                  # Global styles + Tailwind
        ├── components/
        │   ├── common/                # Button, Card, Badge, Modal, Toast
        │   ├── layout/                # AppShell, Navbar, Sidebar
        │   ├── letters/               # Letter registration, timeline, details
        │   ├── approvals/             # Approval cards, dialogs
        │   └── notifications/         # Notification dropdown, items
        ├── pages/
        │   ├── auth/Login.tsx
        │   ├── dashboard/             # Admin, Manager, Employee dashboards
        │   ├── letters/               # LetterRepository, LetterDetails, CreateLetter
        │   ├── approvals/             # Approvals queue
        │   ├── tasks/MyTasks.tsx       # Admin task center + officer tasks
        │   ├── notifications/         # Notifications page
        │   ├── archives/              # Letter archive
        │   ├── users/                 # User management
        │   ├── departments/           # Department management
        │   └── audit/                 # System audit logs
        ├── hooks/
        │   ├── useAuth.ts
        │   └── useNotifications.ts
        ├── services/
        │   ├── api.ts                 # Axios instance with interceptors
        │   ├── letterService.ts       # Letter API calls
        │   ├── approvalService.ts     # Approval API calls
        │   ├── notificationService.ts # Notification API calls
        │   └── dashboardService.ts    # Dashboard API calls
        ├── routes/
        │   └── AppRoutes.tsx          # Route definitions
        └── types/
            ├── letter.ts
            ├── adminTask.ts
            ├── notification.ts
            ├── auth.ts
            └── ...
```

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm or yarn

### 1. Clone the repository
```bash
git clone https://github.com/Girma35/Letter-Management-System.git
cd Letter-Management-System
```

### 2. Setup Backend
```bash
cd letter-backend

# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Configure DATABASE_URL in .env
# DATABASE_URL=postgresql://user:password@localhost:5432/lms

# Run migrations
npm run migrate

# Seed demo data (optional)
npm run seed

# Start development server
npm run dev
```

Backend runs at **`http://localhost:5000/api`**

### 3. Setup Frontend
```bash
cd letter-frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs at **`http://localhost:5173`**

---

## 📡 API Reference

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/me` | GET | Get current user profile |

### Letters (Documents)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/letters` | GET | List letters (paginated, filtered) |
| `/api/letters` | POST | Create new letter |
| `/api/letters/:id` | GET | Get letter details |
| `/api/letters/:id/route` | POST | Route letter to department |
| `/api/letters/:id/assign` | POST | Assign letter to officer |
| `/api/letters/:id/register-outgoing` | POST | Register outgoing letter |
| `/api/letters/:id/dispatch` | POST | Dispatch letter |
| `/api/letters/:id/complete` | POST | Mark letter completed |
| `/api/letters/:id/archive` | POST | Archive letter |
| `/api/letters/:id/submit` | POST | Submit for approval |
| `/api/letters/:id/download` | GET | Download attachment |

### Approvals
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/approvals` | GET | Get approval queue |
| `/api/approvals/:id/approve` | POST | Approve letter |
| `/api/approvals/:id/reject` | POST | Reject letter |
| `/api/approvals/:id/request-changes` | POST | Request changes |

### Tasks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks/my` | GET | Get my tasks |
| `/api/tasks/my/summary` | GET | Get task summary |
| `/api/tasks/:id` | GET | Get task details |
| `/api/tasks/:id/claim` | POST | Claim task |
| `/api/tasks/:id/complete` | POST | Complete task |

### Notifications
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications` | GET | Get notifications |
| `/api/notifications/unread-count` | GET | Get unread count |
| `/api/notifications/:id/read` | POST | Mark as read |
| `/api/notifications/read-all` | POST | Mark all as read |

---

## 🗄️ Database

### Tables
| Table | Description |
|-------|-------------|
| `users` | System users with roles |
| `departments` | Organization directorates |
| `documents` | Letters (incoming, outgoing, internal) |
| `document_versions` | Attachment version history |
| `approvals` | Approval requests and reviews |
| `approval_activities` | Approval activity feed |
| `comments` | Letter discussion threads |
| `notifications` | User notifications |
| `admin_tasks` | Administrative workflow tasks |
| `audit_logs` | Immutable audit trail |

### Running Migrations
```bash
cd letter-backend
npm run migrate
```

---

## 📄 License

Developed for the **Sidama Innovation and Technology Agency (SITA)**. All rights reserved.
