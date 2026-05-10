# FaceTrack Pro v3 — Deployment Guide

## What changed from local version
- **IndexedDB removed** — all data now lives in Supabase (PostgreSQL in the cloud)
- **Works on any device / PC** — register on one computer, mark attendance on another
- **Free to host** — Supabase free tier + Render free tier = $0/month

---

## Step 1 — Create your Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Give it a name (e.g. `facetrack`) and set a database password (save it somewhere)
4. Choose the region closest to you
5. Wait ~2 minutes for the project to be ready

---

## Step 2 — Create the database tables

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `schema.sql` from this project and paste its entire contents
4. Click **Run**
5. You should see "Success" — all 5 tables are now created

---

## Step 3 — Get your credentials

1. In Supabase, click **Settings** (gear icon) → **API**
2. Copy **Project URL** — looks like `https://abcdefghij.supabase.co`
3. Copy **anon / public** key — a long string starting with `eyJ...`

---

## Step 4 — Fill in config.js

Open `js/config.js` and replace the placeholder values:

```js
window.SUPABASE_URL      = 'https://YOUR_REAL_PROJECT_ID.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR_REAL_ANON_KEY_HERE';
```

Save the file. The anon key is **safe to commit to GitHub** — it is designed
to be public. Security is handled by Row Level Security + the app's own
branch-password system.

---

## Step 5 — Push to GitHub

If you don't have Git installed: [https://git-scm.com/downloads](https://git-scm.com/downloads)

```bash
# In your project folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/facetrack-pro.git
git push -u origin main
```

---

## Step 6 — Deploy on Render (free hosting)

1. Go to [https://render.com](https://render.com) and sign up with your GitHub account
2. Click **New** → **Static Site**
3. Connect your GitHub repo (`facetrack-pro`)
4. Set these settings:
   - **Name**: facetrack-pro (or anything you like)
   - **Branch**: main
   - **Publish directory**: `.`  (just a dot — the root of the repo)
   - **Build command**: leave blank
5. Click **Create Static Site**
6. Render will deploy in ~1 minute and give you a URL like `https://facetrack-pro.onrender.com`

---

## How to update the live site

Just push to GitHub — Render redeploys automatically:

```bash
git add .
git commit -m "Your update message"
git push
```

---

## Storage limits (Supabase free tier)

The free tier gives you **500 MB** of database storage. Here's roughly what that means:

| Data type | Size per record | Records before 500 MB |
|---|---|---|
| Student (with photo) | ~100 KB | ~5,000 students |
| Attendance record (with snapshot) | ~50 KB | ~10,000 records |
| Unknown face snapshot | ~50 KB | ~10,000 records |

For a college with 500 students and daily attendance over a year (~500 records/day × 200 days = 100,000 records), you will approach the limit. Options when that happens:
- Upgrade Supabase to Pro tier ($25/month) for 8 GB
- Periodically clear old unknown-face snapshots from Settings
- Export and archive old attendance data via the CSV export

---

## Running locally (still works)

```bash
cd facetrack-v3
python -m http.server 8080
# Open http://localhost:8080
```

The app now needs internet to connect to Supabase even when run locally.
Face detection models still load from CDN on first boot.

---

## Folder structure

```
facetrack-v3/
├── index.html
├── schema.sql        ← run once in Supabase SQL Editor
├── css/
│   └── main.css
└── js/
    ├── config.js     ← fill in your Supabase credentials
    ├── db.js         ← Supabase backend (replaces IndexedDB)
    ├── auth.js
    ├── faceEngine.js
    ├── session.js
    ├── register.js
    ├── recognize.js
    ├── pages.js
    └── app.js
```

---

## Troubleshooting

**Boot fails with "Fill in your Supabase URL"**
→ Open `js/config.js` and replace both placeholder values with your real credentials.

**Boot fails with "Cannot reach Supabase"**
→ Check your URL and anon key are correct. Make sure you ran `schema.sql` in Supabase.

**Students don't appear after registering**
→ Open browser DevTools → Console — look for a red error. Usually a missing RLS policy.
→ Re-run `schema.sql` in Supabase (it uses `create if not exists` so it's safe to re-run).

**Camera doesn't work on the deployed URL**
→ Browsers require HTTPS for camera access. Render provides HTTPS automatically, so this should work. If testing locally, use `http://localhost` not `http://127.0.0.1`.

**Face recognition is slow**
→ The face models (~6 MB) are cached by the browser after first load.
→ The app now does far fewer DB calls during scanning (in-memory tracking).
