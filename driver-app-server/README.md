
# Driver App Server (with PDFs + Admin)

This project hosts a **Driver Application form** and an **Admin Dashboard** on a single Node.js service.  
Features:
- Save each application to `applications.json`
- Auto-generate a professional **PDF** for every submission (stored in `/pdfs`)
- Admin dashboard to view and download PDFs
- Optional **email** each PDF to you (configure SMTP env vars)

## Project Structure

```
driver-app-server/
├── server.js
├── package.json
├── applications.json        # auto-created on first submission
├── pdfs/                    # auto-created; stores generated PDFs
└── public/
    ├── index.html           # driver application form
    ├── logo.png             # (optional) replace with your logo file
    └── admin/
        └── index.html       # admin dashboard
```

## Run Locally

```bash
npm install
npm start
```

Then open http://localhost:3000

## Deploy on Render

1. Push this folder to GitHub
2. On Render:
   - New → Web Service
   - Select your repo
   - Environment: **Node**
   - Build Command: (leave empty)
   - Start Command: `npm start`
   - Root Directory: (leave empty)
3. Set **Environment Variables** (optional for email):
   - `SMTP_HOST`
   - `SMTP_PORT` (e.g. 587)
   - `SMTP_USER`
   - `SMTP_PASS`
   - `EMAIL_TO` (where to receive PDFs)
   - `EMAIL_FROM` (displayed sender, e.g. `ALSAQQAF Logistics <no-reply@yourdomain.com>`)
4. Deploy

### Admin URL
Once deployed, your admin page will be at:
```
https://YOUR-SERVICE.onrender.com/admin
```

### Notes
- Place your company logo as `public/logo.png` to include it in PDFs automatically.
