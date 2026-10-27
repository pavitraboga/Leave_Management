# Employee Leave Management System — CI/CD with Jenkins + Docker

**Aim:** Implement an end-to-end CI/CD pipeline using Jenkins and Docker for automated application deployment.

## Project structure

```
leave-management-system/
├── src/
│   ├── rules.js              # business rules (maxDaysPerApproval = demo knob)
│   ├── app.js                # Express routes (employee / manager / HR)
│   ├── server.js             # starts app, connects MongoDB
│   ├── seed.js               # demo employees + sample leaves (fresh DB only)
│   └── stores/
│       ├── memoryStore.js    # used by tests (no DB needed in CI)
│       └── mongoStore.js     # used in the deployed container
├── public/                   # Absenta UI (index.html, styles.css, app.js)
├── tests/leave.test.js       # Jest + Supertest (17 tests)
├── Dockerfile                # multi-stage: node:20 build -> node:20-alpine runtime
├── docker-compose.yml        # app + MongoDB started together
├── Jenkinsfile               # Checkout -> Test -> Build -> Deploy -> Health Check
└── jenkins/                  # Jenkins container with Docker CLI + Compose
    ├── Dockerfile
    └── docker-compose.yml
```

## Business rules tested automatically
1. No overlapping leave dates (against PENDING and APPROVED requests) -> 409
2. Leave balance is deducted only when a manager approves
3. Leave is rejected when balance is zero or insufficient -> 422
4. Only managers can approve/reject; only HR can view balances -> 403
5. A request cannot be decided twice -> 409
6. **Demo rule:** a manager cannot approve leave longer than `maxDaysPerApproval` days -> 422

---

## Steps to perform

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine + Compose plugin (Linux) — running
- Git and Node.js 20 installed locally
- A GitHub account

### Step 1 — Run the tests locally
```bash
cd leave-management-system
npm install          # creates package-lock.json (needed by `npm ci` in Jenkins)
npm test             # all tests should pass
```

### Step 2 — Push to GitHub
Create an empty repo on GitHub (e.g. `leave-management-system`), then:
```bash
git init
git add .
git commit -m "Leave management app with CI/CD pipeline"
git branch -M main
git remote add origin https://github.com/<your-username>/leave-management-system.git
git push -u origin main
```
Make sure `package-lock.json` is committed.

### Step 3 — Start Jenkins (in Docker)
```bash
cd jenkins
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```
Open http://localhost:8080 → paste the password → **Install suggested plugins** → create an admin user.

(The image already includes the Git, Pipeline, Docker Pipeline, JUnit and Timestamper plugins, plus the Docker CLI. The Docker socket is mounted so Jenkins can build and run containers on your machine.)

### Step 4 — Create the pipeline job
1. Jenkins → **New Item** → name `leave-pipeline` → **Pipeline** → OK
2. **Pipeline** section → Definition: **Pipeline script from SCM**
3. SCM: **Git** → Repository URL: your GitHub repo URL (public repo needs no credentials)
4. Branch: `*/main` → Script Path: `Jenkinsfile` → **Save**
5. Click **Build Now** once (this first run also registers the `pollSCM` trigger)

### Step 5 — Watch the stages
Open the build → **Stage View** / **Console Output**:

| Stage | What happens |
|---|---|
| Checkout | Pulls latest code from GitHub |
| Test | `npm ci` then `npm test` inside a `node:20` container; JUnit report published |
| Build Image | Multi-stage `docker build`, tagged `leave-app:<build-number>` and `latest` |
| Deploy | `docker compose up -d` — starts MongoDB + app together |
| Health Check | `curl -f http://…:3000/health` (retries until healthy, else fails) |

If any test fails, the pipeline stops and **the old version keeps running**.

### Step 6 — Use the app (Absenta)
Open http://localhost:3000. The header shows the **build number** and the **current approval limit**.
Use the **Employee | Manager** toggle at the top to switch views.

- **Employee view:** balance / taken / pending donut charts, "Up Next", a month calendar of your leave,
  your leave record, and a **Request a Leave** form that previews days, balance after approval and rule warnings.
- **Manager view:** KPI cards, pending approvals (flags requests over the limit or over balance),
  team availability for today, team calendar (week grid or month), team balance bars,
  request-status donut, leave-days-by-month chart and decision history.

Seeded users: Asha, Ravi (0 balance), Vikram, Neha (employees), Meera (manager), Kiran (HR), plus sample leaves.
- Apply as Ravi → "leave balance is zero"
- Apply as Asha for dates overlapping an existing request → overlap error
- Approve as Meera → the balance drops in the charts

> Sample leaves are only added when the database is empty. To reset to the demo data once:
> `docker compose down -v` then rebuild in Jenkins (or `docker compose up -d --build`).

Check health: `curl -f http://localhost:3000/health`

---

## Demo: change a rule → live in minutes, no manual steps

1. In the browser, apply as Asha for **8 days** (e.g. 2026-12-01 → 2026-12-08). Approve as Meera → **APPROVED** (limit is 10).
2. Edit `src/rules.js`:
   ```js
   maxDaysPerApproval: 5,
   ```
3. Push:
   ```bash
   git commit -am "Policy change: max 5 days per approval"
   git push
   ```
4. Within ~1 minute Jenkins detects the push (pollSCM) and runs Test → Build → Deploy → Health Check automatically.
5. Refresh http://localhost:3000 — header shows the new build number and "max 5 days per approval".
   Apply for 8 days and approve → **"leave of 8 days exceeds the approval limit of 5 days"**.

Optional (show CI catching a bug): break a rule (e.g. remove the overlap check in `src/app.js`), push → the **Test stage fails**, nothing is deployed, the running app is unchanged.

---

## Troubleshooting
- **`npm ci` fails "missing package-lock.json"** → run `npm install` locally and commit `package-lock.json`.
- **Health check can't reach host.docker.internal (Linux)** → the `extra_hosts` line in `jenkins/docker-compose.yml` handles this; recreate Jenkins with `docker compose up -d`.
- **Port 3000 or 8080 already in use** → stop the other process or change the port mapping.
- **Permission denied on /var/run/docker.sock** → the Jenkins container runs as root in `jenkins/docker-compose.yml` for this reason; make sure that file was used.
- **Want instant trigger instead of polling?** Add a GitHub webhook (needs a public URL, e.g. via ngrok) and tick "GitHub hook trigger for GITScm polling".

## Result
An automated CI/CD pipeline was implemented with Jenkins and Docker. Every push is tested, packaged as a Docker image, deployed with MongoDB using Docker Compose, and verified with a health check — with no manual steps.
