# Fly.io'ga deploy qilish

Bu loyiha Fly.io uchun tayyor: `Dockerfile`, `fly.toml`, production uchun PostgreSQL
sxemasi (`prisma-prod/`). Quyidagi qadamlarni flyctl o'rnatilgan va fly.io'ga
kirish huquqi bo'lgan muhitda bajaring.

## 1. flyctl o'rnatish va kirish

```bash
curl -L https://fly.io/install.sh | sh
fly auth login   # yoki: export FLY_API_TOKEN=...
```

## 2. Ilova va Postgres yaratish

```bash
fly apps create kpi-audit-pro-olmosriver   # fly.toml dagi `app` nomi bilan bir xil bo'lsin
fly postgres create --name kpi-audit-pro-db --region fra --vm-size shared-cpu-1x --volume-size 3
fly postgres attach kpi-audit-pro-db -a kpi-audit-pro-olmosriver   # DATABASE_URL ni avtomatik sozlaydi
```

## 3. Qolgan maxfiy o'zgaruvchilar

```bash
fly secrets set NEXTAUTH_SECRET="$(openssl rand -hex 32)" -a kpi-audit-pro-olmosriver
fly secrets set NEXTAUTH_URL="https://kpi-audit-pro-olmosriver.fly.dev" -a kpi-audit-pro-olmosriver
# Ixtiyoriy, AI tavsiyalari uchun:
# fly secrets set ANTHROPIC_API_KEY="..." -a kpi-audit-pro-olmosriver
```

## 4. Volume (hujjat yuklash uchun doimiy xotira)

```bash
fly volumes create kpi_audit_data --region fra --size 3 -a kpi-audit-pro-olmosriver
```

## 5. Deploy

```bash
fly deploy -a kpi-audit-pro-olmosriver
```

`release_command` (fly.toml) har bir deployda avtomatik `prisma migrate deploy`ni
PostgreSQL sxemasiga (`prisma-prod/schema.prisma`) qarshi ishga tushiradi.

## 6. Boshlang'ich ma'lumotlarni yuklash (bir martalik)

Mahalliy kompyuteringizda (loyiha papkasida):

```bash
fly proxy 5433:5432 -a kpi-audit-pro-db &
DATABASE_URL="postgresql://postgres:<parol>@localhost:5433/kpi_audit_pro_olmosriver" \
  npx prisma generate --schema=prisma-prod/schema.prisma
DATABASE_URL="postgresql://postgres:<parol>@localhost:5433/kpi_audit_pro_olmosriver" \
  npx tsx prisma/seed.ts
npx prisma generate --schema=prisma/schema.prisma   # mahalliy SQLite client'ni tiklash
```

Postgres parolini `fly postgres users list -a kpi-audit-pro-db` yoki Postgres yaratilganda
chiqqan natijadan oling.

## Demo hisoblar (seed skripti)

| Email | Парол | Роль |
|---|---|---|
| admin@kpiaudit.pro | Admin123! | Administrator |
| manager@kpiaudit.pro | Manager123! | Менежер |
| employee@kpiaudit.pro | Employee123! | Ходим |

**Production'da birinchi ishdan keyin bu parollarni albatta o'zgartiring** (Admin panel → Фойдаланувчилар).
