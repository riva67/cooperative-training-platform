# Cooperative Training Platform – Backend

Node.js + Express + Prisma + PostgreSQL.
**API documentation (interactive): http://localhost:4000/docs** (source: `openapi.yaml`)

## Setup (5 minutes)

```bash
npm install
cp .env.example .env          # then edit JWT_SECRET (DATABASE_URL default works with Docker)
docker compose up -d          # starts PostgreSQL (Docker Desktop must be running)
npx prisma migrate dev        # creates the tables
npm run db:seed               # creates the test accounts
npm run dev                   # http://localhost:4000/health
```

## Test accounts (password for all: `Password123!`)

| Role | Email |
|---|---|
| Admin | admin@coop.test |
| Student | student@coop.test |
| Academic supervisor | academic@coop.test |
| Company supervisor | company@coop.test |

## Automated check

With the server running, in a second terminal:

```bash
npm run test:smoke
```

It tests login, roles/permissions, assignments and logs, and cleans up after itself. Run it after pulling changes.
Two more end-to-end checks: `npm run test:flow` (training lifecycle) and `npm run test:provider`
(account approval + training-provider portal + impact indicators).

## What is implemented

| Area | Endpoints | Owner |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/password`, `PATCH /auth/profile` | Lead |
| Users (admin) | `POST/GET /users` (`?status=PENDING` = requests), `GET /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/active` (approve), `POST /users/:id/reject` | Lead |
| Organizations | `GET/POST /organizations`, `GET/PATCH /organizations/:id` (type: PRIVATE / EDUCATIONAL / GOVERNMENT) | ✅ done |
| Assignments | `POST /assignments`, `GET /assignments`, `GET /assignments/:id`, `PATCH /assignments/:id/status` | Lead |
| Logs (admin) | `GET /logs` | Lead |
| Evaluation form (نموذج تقييم المتدرب) | `GET /evaluations/criteria`, `POST /evaluations`, `GET /evaluations`, `GET /evaluations/:assignmentId` | Lead |
| Field visits (الزيارات الميدانية) | `POST /visits`, `GET /visits`, `PATCH /visits/:id`, `/respond`, `/cancel` | Lead |
| Messaging (chat + email-style + files) | `/messages/*`, `/attachments/*` | Lead |
| Opportunities (`/opportunities`) | create, list (`?mine=true`, `?organizationType=`, `?type=`), get, update/close, delete (no applicants), `/opportunities/summary` (seats) | ✅ done |
| Applications (`/applications`) | apply, list, nominate/approve/reject; `/opportunities/:id/applicants` (sorted by GPA); `/assignments/:id/letter` (training letter) | ✅ done |
| Attendance | `/attendance/check-in`, `/attendance/check-out`, `PATCH /attendance/:id`, `POST /attendance/mark`, `/assignments/:id/attendance` | ✅ done |
| Form (1) commencement | `GET/PATCH /assignments/:id/commencement` (date filled on the first check-in) | ✅ done |
| Reports | `/reports` (submit with file + week number, list, get), `PATCH /reports/:id` (edit / resubmit), `PATCH /reports/:id/status`; provider types `ABSENCE_WARNING`, `VISIT` | ✅ done |
| Employment | `PATCH /assignments/:id/employment` (after completion) | ✅ done |
| Supervision | `/supervisor/students`, `/notes`, `/assignments/:id/notes`, `/final-grades` | ✅ done |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` | ✅ done |
| Statistics | `GET /stats/summary` (completion rate, would-hire rate, attendance, grades, evaluation average) | ✅ done |

### Application flow
`PENDING` -> `NOMINATED` (academic supervisor) -> `APPROVED` / `REJECTED` (organization supervisor of that opportunity). Admin can do any step.
After `APPROVED`, an admin creates the assignment with `POST /assignments`. The final grade (`POST /final-grades`) marks the assignment `COMPLETED`.

### Impact indicators (project success measures)
| Indicator | Where |
|---|---|
| Number of training opportunities | `stats/summary` -> `totalOpportunities`, `openOpportunities` |
| Training completion rate | `completionRate` |
| Training provider satisfaction | `providerSatisfaction` (1..5, from `satisfaction` in the evaluation form) |
| Post-training employment | `employmentRate` (from `PATCH /assignments/:id/employment`); `wouldHireRate` = intention only |

## Account approval
| Role | Sign-up | Can log in |
|---|---|---|
| Student | `POST /auth/register` | immediately |
| Academic supervisor (مشرف) | `POST /auth/register` | after an admin approves (`status` PENDING -> ACTIVE) |
| Training provider (جهة تدريبية) | `POST /auth/register` (+ organization name, type, optional CR number) | after an admin approves |
| Admin | never self-registers | — |

A refused login returns 403 with `code`: `PENDING`, `REJECTED` (+ `reason`) or `SUSPENDED`.
The login response of a training provider includes `user.organization.type`, used by the provider portal.

## Feature notes

- **Evaluation form:** 8 criteria x 5 points = 40. One form per trainee, filled by the organization supervisor. Students cannot see it.
- **Field visits:** the academic supervisor books a date/time with an organization supervisor who has one of their trainees; the organization approves or declines (with an automatic polite message). The visits table shows organization, supervisor, phone, date, a Done checkbox and notes. Phone numbers come from `User.phone` (set with `PATCH /auth/profile`).
- **Messaging:** only academic supervisor <-> their students / their organizations. Uploaded files are stored in `uploads/` (ignored by Git, max 10 MB). `POST /messages/broadcast` sends one message (e.g. a form) to all students and/or organizations.
- **After pulling this update:** run `npm install` and `npx prisma migrate dev` (applies the new migration), then `npm run db:seed` to add phone numbers to the test accounts.

## Rules for module authors

1. **Start from `src/modules/_template/example.routes.js`.** Copy it into your own folder and rename.
2. **Routers are mounted at the root in `src/app.js`**, so write full paths (`'/attendance/check-in'`, `'/assignments/:id/attendance'`) and add `authenticate` to **each route** (not `router.use(authenticate)`). In `app.js`, uncomment only your own line.
3. **Permissions:** `requireRole('STUDENT')` etc. (ADMIN always passes).
4. **Anything under an assignment** (attendance, reports, notes, evaluations, final grade): load it with
   `getAccessibleAssignment(req.user, id, { roles: [...] })` from `src/utils/access.js`. It throws 400/403/404 for you,
   so a student can never see another student's data. For list endpoints use `assignmentAccessWhere(req.user)`.
5. **Validate input** with Zod using `validate(schema)` / `validate(schema, 'query')`.
6. **Wrap handlers** in `asyncHandler(...)` and throw `new HttpError(status, message)` for errors.
7. **Log important actions:** `await logAction(req.user.id, 'REPORT_APPROVED', 'Report', id)`.
8. **Notify people:** `await notify(userId, 'message')` (note: it takes a USER id, not a profile id).
9. **Follow `openapi.yaml` exactly.** The frontend team builds against it. If you need a change, tell the lead first.
10. **Schema changes:** tell the lead; then `npx prisma migrate dev --name <change>` and commit the migration.
11. Work on your own branch (`git checkout -b feature/<name>`), open a Pull Request, run `git pull origin main` daily, and run `npm run test:smoke` before opening it.

## IDs: user ID vs profile ID
`student.id`, `academicSupervisor.id` and `orgSupervisor.id` are **profile IDs** (used in assignments).
`req.user.id`, `notify(...)`, `submittedById`, `supervisorId`, `evaluatorId` use the **user ID**.
