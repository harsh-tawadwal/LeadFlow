import { z } from "zod";

/**
 * Validates required environment variables at startup.
 *
 * Importing this module anywhere triggers validation. If a required
 * variable is missing or malformed, the process fails fast with a
 * clear error instead of surfacing as an obscure runtime failure
 * later (e.g. inside Prisma or the auth layer).
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid connection string"),
  DIRECT_URL: z
    .string()
    .min(1, "DIRECT_URL is required")
    .url("DIRECT_URL must be a valid connection string"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid or missing environment variables:\n${formatted}`);
  }

  return parsed.data;
}

export const env = loadEnv();
