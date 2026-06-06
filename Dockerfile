# Produktionsbild för VM-tips (Next.js + Prisma).
FROM node:20-bookworm-slim

# openssl krävs av Prismas query engine
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

WORKDIR /app

# Installera beroenden (cachas så länge lockfilen är oförändrad)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Bygg appen (kör prisma generate + next build)
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000

# Vid start: synka schema, seeda (idempotent – rör ej inmatade resultat) och kör appen
CMD ["sh", "-c", "pnpm exec prisma db push --skip-generate && pnpm seed && pnpm exec next start -H 0.0.0.0 -p 3000"]
