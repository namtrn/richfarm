# RichFarm Backend (TypeScript)

Backend quản lý `master_plants` + dashboard CRUD tự động theo schema database (SQLite).

## Chạy local

```bash
cd /Users/n/Documents/GitHub/richfarm/backend
npm install
npm run dev
```

Mặc định chạy tại:
- API: `http://localhost:4000`
- Dashboard: `http://localhost:4000/dashboard`

## Biến môi trường

- `PORT`: cổng server (mặc định `4000`)
- `DB_PATH`: đường dẫn file SQLite (mặc định `./data/richfarm.db`)

## Test

```bash
npm test
```

Bao phủ edge cases chính:
- Validation pH sai range
- Duplicate `plant_code`
- Query params sai
- Unknown table / unknown column
- Giá trị numeric không hợp lệ
- CRUD lifecycle + not found

## Build & chạy production

```bash
npm run build
npm start
```

## Docker deploy (dễ đẩy lên Render/Railway/Fly)

```bash
docker build -t richfarm-backend .
docker run -p 4000:4000 -e PORT=4000 -e DB_PATH=/app/data/richfarm.db -v $(pwd)/data:/app/data richfarm-backend
```
