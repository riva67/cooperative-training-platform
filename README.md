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

## What is implemented

| Area | Endpoints | Owner |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `PATCH /auth/password` | Lead |
| Users (admin) | `POST/GET /users`, `GET /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/active` | Lead |
| Assignments | `POST /assignments`, `GET /assignments`, `GET /assignments/:id`, `PATCH /assignments/:id/status` | Lead |
| Logs (admin) | `GET /logs` | Lead |
| Evaluation form (نموذج تقييم المتدرب) | `GET /evaluations/criteria`, `POST /evaluations`, `GET /evaluations`, `GET /evaluations/:assignmentId` | Lead |
| Field visits (الزيارات الميدانية) | `POST /visits`, `GET /visits`, `PATCH /visits/:id`, `/respond`, `/cancel` | Lead |
| Messaging (chat + email-style + files) | `/messages/*`, `/attachments/*` | Lead |
| Opportunities, applications, attendance, student reports | see `/docs` | Member B |
| Supervisor dashboard, notes, final grades, notifications, statistics | see `/docs` | Member C |

**Note for Member C:** evaluations are now implemented by the lead (the form has 8 fixed criteria, see `src/modules/evaluations`). Please do not build them. `GET /stats/summary` should include `wouldHireRate` = % of evaluations with `wouldHire = true` (the employment indicator).

## Feature notes

- **Evaluation form:** 8 criteria x 5 points = 40. One form per trainee, filled by the organization supervisor. Students cannot see it.
- **Field visits:** the academic supervisor books a date/time with an organization supervisor who has one of their trainees; the organization approves or declines (with an automatic polite message). The visits table shows organization, supervisor, phone, date, a Done checkbox and notes. Phone numbers come from `User.phone` (set with `PATCH /auth/profile`).
- **Messaging:** only academic supervisor <-> their students / their organizations. Uploaded files are stored in `uploads/` (ignored by Git, max 10 MB). `POST /messages/broadcast` sends one message (e.g. a form) to all students and/or organizations.
- **After pulling this update:** run `npm install` and `npx prisma migrate dev` (applies the new migration), then `npm run db:seed` to add phone numbers to the test accounts.

## Rules for module authors (Members B and C)

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
