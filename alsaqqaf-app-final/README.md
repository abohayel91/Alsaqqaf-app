
# ALSAQQAF Logistics — Combined App (Final)

Single Render service:
- `/` Driver Application (original design kept)
- `/admin` Admin Dashboard (password protected; auto-redirect to login)
- Saves each submission to `applications.json`
- Generates a PDF for every application (logo on **all pages**; centered footer "© ALSAQQAF LOGISTICS LLC")
- Emails each PDF (configure SMTP)

## Deploy on Render
1. Push to GitHub
2. Render → New → Web Service
   - Environment: Node
   - Build Command: (leave empty)
   - Start Command: `npm start`
   - Root Directory: (leave empty)
3. Environment Variables:
   - `ADMIN_USER=salemmohsin313@gmail.com`
   - `ADMIN_PASS=Alsaqqaf313$$`
   - `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS`
   - `EMAIL_TO=salemmohsin313@gmail.com`
   - `EMAIL_FROM=ALSAQQAF Logistics <no-reply@yourdomain.com>`
