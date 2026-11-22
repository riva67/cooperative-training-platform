# Cooperative Training Management Platform
# منصة إدارة التدريب التعاوني

**Project 45 – Applied Projects Committee, Najran University (Applied College – Computer Department)**

<div dir="rtl">

منصة ويب تربط **الطالب** و**المشرف الأكاديمي** و**جهة التدريب** في مكان واحد، ويديرها **مسؤول النظام**:
نشر فرص التدريب ← تقديم الطالب ← ترشيح المشرف ← قبول الجهة ← التكليف ← الحضور والتقارير والزيارات الميدانية
ونماذج الجامعة ← الدرجة النهائية ← مؤشرات الأثر (عدد الفرص، نسبة الإكمال، رضا جهات التدريب، نسبة التوظيف بعد التدريب).

**التقنيات:** React + Tailwind CSS للواجهات، Node.js + Express.js للخادم، PostgreSQL لقاعدة البيانات (عبر Prisma).

</div>

---

A web platform that connects the **student**, the **academic supervisor** and the **training provider**, managed by an
**administrator**: training opportunities → applications → nomination → acceptance → placement → attendance, reports,
field visits and evaluation forms → final grade → impact indicators.

## Repository structure

```
cooperative-training-platform/
├── backend/               Node.js + Express + Prisma + PostgreSQL (REST API, port 4000)
└── portals/
    ├── main/              Home page, login and sign-up for every role        (port 5174)
    ├── student/           Student portal                                      (port 5173)
    ├── provider/          Training-provider portal (جهة التدريب)               (port 5175)
    ├── supervisor/        Academic-supervisor portal (المشرف الأكاديمي)         (port 5177)
    └── admin/             Administrator portal (مسؤول النظام)                   (port 5176)
```

Everybody logs in on the **main portal**; it then opens the portal of the user's role.
Each folder is an independent project with its own `package.json` and `.env.example`.

## Requirements

- Node.js 20 or newer
- Docker Desktop (runs PostgreSQL), or a local PostgreSQL 16

## Run it locally

```bash
# 1) backend (first time)
cd backend
npm install
cp .env.example .env          # set JWT_SECRET; the default DATABASE_URL works with Docker
docker compose up -d          # starts PostgreSQL
npx prisma migrate dev        # creates the tables
npm run db:seed               # test accounts
npm run dev                   # http://localhost:4000  (API docs: http://localhost:4000/docs)
npm run db:demo               # optional, in a second terminal: demo data for every portal

# 2) each portal, in its own terminal (first time: npm install, and cp .env.example .env)
cd portals/main        && npm install && npm run dev   # http://localhost:5174  ← open this one
cd portals/student     && npm install && npm run dev
cd portals/provider    && npm install && npm run dev
cd portals/supervisor  && npm install && npm run dev
cd portals/admin       && npm install && npm run dev
```

On Windows (PowerShell / cmd) use `copy .env.example .env` instead of `cp`, and make sure Docker Desktop is running
before `docker compose up -d`. If PostgreSQL is also installed on Windows it may already use port 5432; stop that
service or change `DATABASE_URL` in `backend/.env`.

If a login returns **"Internal server error"**, the API cannot reach the database or the tables are missing:
start the database (`docker compose up -d`), then run `npx prisma migrate dev` and `npm run db:seed` in `backend/`.

In `backend/.env`, `CORS_ORIGIN` must list the five portal addresses:
`http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177`

## Test accounts (password for all: `Password123!`)

| Role | E-mail |
|---|---|
| Administrator | admin@coop.test |
| Student | student@coop.test |
| Academic supervisor | academic@coop.test |
| Training provider | company@coop.test |

After `npm run db:demo`: trainee `noura@coop.test`, students `sara@coop.test`, `reem@coop.test`, `joud@coop.test`,
and pending registration requests for the administrator.

## Automated tests (backend running)

```bash
cd backend
npm run test:smoke      # login, roles, permissions, assignments, logs
npm run test:flow       # full training lifecycle
npm run test:provider   # account approval, provider portal, impact indicators
```

## Main features

| Feature | Where |
|---|---|
| Sign-up with administrator approval (supervisors and providers), organization type | main, admin |
| Training opportunities with seats and application deadline | provider, student |
| Applications → nomination (supervisor, by GPA) → acceptance (provider) → placement (admin) | student, supervisor, provider, admin |
| Daily check-in / check-out, attendance corrections, absence warnings | student, provider, supervisor |
| Weekly / final reports with files, review and resubmission | student, supervisor, provider |
| Field visits: booked by the supervisor, answered by the provider | supervisor, provider |
| University forms: (1) trainee commencement, (2) provider evaluation with signature; training letter | provider, supervisor, student |
| Final grade (out of 100) and post-training employment | supervisor, student |
| Notifications, messaging with attachments, audit log | all |
| Impact indicators: opportunities, completion rate, provider satisfaction, employment rate | admin, supervisor |

## Team

Developed by the Project 45 team. The history of each part is kept in this repository
(original repositories: backend – riva67, main portal and student-portal design – Ghadah000 / shaima-08,
provider portal – Shahad1-445, supervisor-portal design – ssrrs0283-dev).
