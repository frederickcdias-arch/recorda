# Recorda — Security Review (OWASP Top 10)

> Reviewed: 2026-02-11 | Scope: Backend + Frontend

## Summary

| #   | OWASP Category            | Status       | Notes                                                                          |
| --- | ------------------------- | ------------ | ------------------------------------------------------------------------------ |
| A01 | Broken Access Control     | ✅ Mitigated | JWT auth + role-based `authorize()` middleware on all protected routes         |
| A02 | Cryptographic Failures    | ✅ Mitigated | bcrypt(10) for passwords, SHA-256 for reset tokens, JWT with env-based secret  |
| A03 | Injection                 | ✅ Mitigated | All SQL uses parameterized queries ($1, $2...), no string interpolation in SQL |
| A04 | Insecure Design           | ⚠️ Partial   | Reset tokens expire in 1h, but no account lockout after failed login attempts  |
| A05 | Security Misconfiguration | ✅ Mitigated | Helmet headers, restrictive CORS in prod, CSP enabled, rate limiting           |
| A06 | Vulnerable Components     | ⚠️ Partial   | `xlsx` has known vuln (no fix available), fastify + jwt updated to latest      |
| A07 | Auth Failures             | ✅ Mitigated | Passwords hashed, tokens hashed, refresh token rotation, graceful expiry       |
| A08 | Data Integrity Failures   | ✅ OK        | No deserialization of untrusted data, PDF reports use server-side generation   |
| A09 | Logging & Monitoring      | ✅ Mitigated | Structured logging (Pino + custom logger), /health and /metrics endpoints      |
| A10 | SSRF                      | ✅ OK        | No user-controlled URL fetching in backend                                     |

## Detailed Findings

### ✅ Implemented Controls

- **Parameterized SQL** — All 50+ database queries use `$1, $2...` parameter binding
- **Password hashing** — bcrypt with cost factor 10
- **Reset token hashing** — SHA-256 before DB storage
- **JWT authentication** — Required on all non-public endpoints
- **Role-based authorization** — `authorize('operador', 'administrador')` middleware
- **Rate limiting** — Global 100/min, login 5/min, forgot-password 3/min
- **CORS** — Restrictive in production (single origin), permissive in dev
- **Helmet** — Security headers including CSP in production
- **No innerHTML/dangerouslySetInnerHTML** — Frontend uses React JSX exclusively
- **No eval()/Function()** — No dynamic code execution
- **Refresh token rotation** — Old token revoked on refresh
- **Graceful error messages** — No stack traces or internal details leaked to client
- **Forgot-password timing** — Always returns same message regardless of email existence

### ⚠️ Known Risks (Accepted)

1. **`xlsx` library** — Has known prototype pollution and ReDoS vulnerabilities. No fix available. Mitigation: only used server-side for report generation with trusted data.

2. **No account lockout** — Failed login attempts are rate-limited (5/min) but no progressive lockout. Acceptable for internal tool with VPN access.

3. **JWT secret in env** — Must be set via `JWT_SECRET` env var. Production deployment must use a strong random secret (min 32 chars).

4. **No HTTPS enforcement** — Backend does not enforce HTTPS. Must be handled by reverse proxy (nginx/traefik) in production.

### 🔒 Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set strong `JWT_SECRET` (min 32 random chars)
- [ ] Set `CORS_ORIGIN` to exact frontend URL
- [ ] Set `APP_URL` to exact frontend URL
- [ ] Configure SMTP for password reset emails
- [ ] Use HTTPS via reverse proxy
- [ ] Set `DB_PASSWORD` to strong password
- [ ] Ensure `.env` is not committed to version control
- [ ] Run `npm audit` periodically
- [ ] Enable PostgreSQL SSL connections
