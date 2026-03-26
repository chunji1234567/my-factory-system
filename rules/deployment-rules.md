# Deployment Rules

1. **Environments**
   - Use `.env` or environment variables for secrets (JWT, DB credentials). Never hardcode.
   - `DEBUG` must be `False` in production; configure `ALLOWED_HOSTS` accordingly.

2. **Build & Static Assets**
   - Frontend: run `npm run build` to generate assets; serve from a CDN or static bucket.
   - Backend: collect static files (`python manage.py collectstatic`) before deployment.

3. **Database & Migrations**
   - Backup database before applying migrations in production.
   - Run `python manage.py migrate` after deployment; monitor for errors.

4. **Monitoring**
   - Log API errors and critical events (inventory adjustments, financial transactions).
   - Enable health checks for both backend (`/health/`) and frontend (status endpoint) if available.
