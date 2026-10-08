# Cooperative Training Platform – Backend

Node.js + Express + Prisma + PostgreSQL.

## Setup (5 minutes)

```bash
npm install
cp .env.example .env          # then edit JWT_SECRET (and DATABASE_URL if needed)
docker compose up -d          # optional: starts PostgreSQL (or use your own install)
npx prisma migrate dev --name init
npm run db:seed
npm run dev                   # http://localhost:4000/health
```

## Test accounts (password for all: `Password123!`)

| Role | Email |
|---|---|
| Admin | admin@coop.test |
| Student | student@coop.test |
| Academic supervisor | academic@coop.test |
| Company supervisor | company@coop.test |

## Try it

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coop.test","password":"Password123!"}'
# copy the token, then:
curl http://localhost:4000/users -H "Authorization: Bearer <TOKEN>"
```

## Endpoints implemented (foundation)

| Method | Path | Access |
|---|---|---|
| GET | /health | public |
| POST | /auth/login | public |
| GET | /auth/me | any logged-in user |
| PATCH | /auth/password | any logged-in user |
| POST | /users | admin |
| GET | /users?role=&search=&page=&limit= | admin |
| GET | /users/:id | admin |
| PATCH | /users/:id/role | admin |
| PATCH | /users/:id/active | admin |

## Conventions for teammates (please follow)

1. **One folder per module** in `src/modules/<name>/` with `<name>.routes.js`. Register it in `src/app.js` (commented lines are there).
2. **Protect every route:** `router.use(authenticate)` then `requireRole('STUDENT')` etc. (ADMIN always passes.)
3. **Validate input** with Zod using `validate(schema)` / `validate(schema, 'query')`.
4. **Wrap handlers** in `asyncHandler(...)` and throw `new HttpError(status, message)` for errors.
5. **Log important actions:** `await logAction(req.user.id, 'APPLICATION_APPROVED', 'Application', id)`.
6. **Send notifications:** `await notify(userId, 'message')` from `src/utils/notify.js`.
7. **Schema changes:** tell the lead (Member A) first; then `npx prisma migrate dev --name <change>` and commit the migration. Never edit the DB by hand.
8. Use feature branches + pull requests; the lead reviews.

## Reference module: copy this pattern
See `src/modules/users/users.routes.js` for routes + validation + role guard + audit log in one file.

## Assignment of work
- **Member B (student side):** opportunities, applications, attendance, student reports
- **Member C (supervisor side):** monitoring, notes, evaluations, final grade, notifications routes, statistics
- **Lead (A):** auth, users, roles, audit logs endpoint, Swagger doc, integration
