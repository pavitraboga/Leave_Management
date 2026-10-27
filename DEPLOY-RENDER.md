# Deploying Absenta to Render (free, no card)

```
git push ─► Jenkins (laptop) ─► npm test ─► docker build ─► docker compose up -d (local) ─► curl /health
                                                         └─► docker push (Docker Hub) ─► Render deploy hook ─► curl https://…onrender.com/health
                                                                                              │
                                                                                     MongoDB Atlas (free)
```

You need three free accounts: **MongoDB Atlas**, **Docker Hub**, **Render** (sign in to Render with GitHub).

---

## Step 1 — Database: MongoDB Atlas
1. Sign up at https://www.mongodb.com/cloud/atlas/register.
2. **Create a cluster → M0 (Free)** · Provider AWS · Region **Mumbai (ap-south-1)** · name `absenta` → Create.
3. **Database user**: username `absenta`, password with **letters and numbers only** (no `@ : / ?`) → Create user.
4. **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`) → Confirm.
   (Render's servers don't have a fixed IP, so this is required.)
5. **Clusters → Connect → Drivers** → copy the connection string and edit it:
   ```
   mongodb+srv://absenta:<password>@absenta.xxxxx.mongodb.net/leave_db?retryWrites=true&w=majority
   ```
   Replace `<password>` and add **`/leave_db`** before the `?`. Keep this — it is your `MONGO_URI`.

## Step 2 — Image registry: Docker Hub
1. Sign up at https://hub.docker.com.
2. **Account settings → Personal access tokens → Generate new token** · access **Read & Write** → copy the token.
3. Push the first image from your project folder (Render needs one to exist before you create the service):
   ```bash
   docker login -u <dockerhub-username>            # paste the token as password
   docker build --platform linux/amd64 -t <dockerhub-username>/absenta:latest .
   docker push <dockerhub-username>/absenta:latest
   ```
   On Docker Hub, make sure the `absenta` repository is **Public**.

## Step 3 — Hosting: Render
1. Sign up at https://render.com (use **Sign in with GitHub**).
2. **New + → Web Service → Existing Image**.
3. Image URL: `docker.io/<dockerhub-username>/absenta:latest` → **Connect**.
4. Settings:
   - Name: `absenta` (your link becomes `https://absenta.onrender.com`, or with a suffix if taken)
   - Region: **Singapore** (closest to India)
   - Instance type: **Free**
   - Environment variables: `MONGO_URI` = the Atlas string from Step 1
   - Advanced → Health Check Path: `/health`
5. **Deploy Web Service**. Wait for "Live", then open the link — the Absenta dashboard should load.
6. **Settings → Deploy Hook** → copy the URL (looks like `https://api.render.com/deploy/srv-…?key=…`). Keep it secret.

## Step 4 — Jenkins credentials
Jenkins (http://localhost:8080) → **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**

| Kind | Fields | ID |
|---|---|---|
| Username with password | Username = Docker Hub username, Password = Docker Hub token | `dockerhub` |
| Secret text | Secret = Render deploy hook URL | `render-deploy-hook` |

The IDs must match exactly.

## Step 5 — Point the Jenkinsfile at your accounts
Edit the two lines at the top of `Jenkinsfile`:
```groovy
IMAGE      = 'docker.io/<dockerhub-username>/absenta'
RENDER_URL = 'https://absenta.onrender.com'      // your real Render link
```
Commit and push. Jenkins picks it up within a minute (or click **Build Now**).

## Step 6 — Watch the pipeline
| Stage | What happens |
|---|---|
| Checkout | Pulls the latest code |
| Test | `npm ci` + `npm test` in a `node:20` container |
| Build Image | Multi-stage build, tagged with the build number and `latest` |
| Deploy Local | `docker compose up -d` (app + MongoDB on your laptop) |
| Health Check Local | `curl -f http://localhost:3000/health` |
| Push to Docker Hub | Pushes `absenta:<build>` and `absenta:latest` |
| Deploy to Render | Calls the deploy hook with this exact image tag |
| Health Check Render | Polls the public `/health` until it reports this build number |

If a test fails, nothing is pushed — the public site keeps the previous version.

## Step 7 — Demo
1. Open the public link; header shows **build N** and **max 10 days / approval**.
2. Change `maxDaysPerApproval` to `5` in `src/rules.js` → commit → push.
3. Jenkins runs automatically; after "Health Check Render" passes, refresh the public link →
   **build N+1**, **max 5 days / approval**, and an 8-day request can no longer be approved.

## Good to know
- **Free Render apps sleep after 15 minutes without visitors**; the first visit then takes ~1 minute.
  Open the link a couple of minutes before showing it.
- Jenkins runs on your laptop, so automatic deploys only happen while it is on. The public site stays up regardless.
- Health check fails with `db: down` → re-check Atlas Network Access (`0.0.0.0/0`) and the password in `MONGO_URI`.
- Deploy hook returns 404 → the Render service's image URL must be exactly `docker.io/<user>/absenta:latest`.
- Never commit the Atlas password, Docker token or deploy hook to GitHub — they live only in Render and Jenkins.
