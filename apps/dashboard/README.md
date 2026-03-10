# Richfarm Dashboard

Standalone React/Vite admin dashboard for Richfarm.

## Run Local

```bash
cd apps/dashboard
npm install
npm run dev
```

## Deploy To Vercel

Create a separate Vercel project for this folder only.

- Root Directory: `apps/dashboard`
- Build Command: `npm run build`
- Output Directory: `dist`

Environment variables:

- `VITE_API_URL=https://your-backend-domain.com`
- `VITE_CONVEX_URL=https://your-convex-deployment.convex.cloud`

Backend environment variables:

- `CORS_ORIGINS=https://your-dashboard.vercel.app`
