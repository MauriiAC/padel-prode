process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-with-at-least-32-characters-xx";
process.env.RESEND_API_KEY ??= "re_test";
process.env.RESEND_FROM_EMAIL ??= "test@example.com";
process.env.APP_URL ??= "http://localhost:3000";
(process.env as Record<string, string>).NODE_ENV = "test";
