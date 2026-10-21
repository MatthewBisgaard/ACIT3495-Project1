import { defineConfig } from 'prisma/config';

// Prisma 7 reads the database URL from here (not from schema.prisma).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL ?? '' },
});