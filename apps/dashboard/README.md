# RichFarm Dashboard

Standalone React/Vite admin dashboard for RichFarm.

## Run Local

From the repository root (recommended; starts the API and dashboard with one
managed process lifecycle):

```bash
npm run dashboard:dev
```

To run only the Vite workspace, use:

```bash
cd apps/dashboard
npm install
npm run dev
```

When the API is not running, `/api/*` requests return a JSON `503 Backend
unavailable` response with a startup hint instead of Vite's generic 500 page.

## Deploy To Vercel

Create a separate Vercel project for this folder only.

- Root Directory: `apps/dashboard`
- Build Command: `npm run build`
- Output Directory: `dist`

Environment variables:

- `VITE_API_URL=https://your-backend-domain.com`

Backend environment variables:

- `CORS_ORIGINS=https://your-dashboard.vercel.app`
