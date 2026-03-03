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
- `JWT_SECRET`: secret ký JWT (bắt buộc đổi ở production)
- `JWT_EXPIRES_IN`: TTL token (mặc định `12h`)
- `ADMIN_EMAIL`: email admin bootstrap lần đầu
- `ADMIN_PASSWORD`: password admin bootstrap lần đầu
- `CONVEX_URL`: URL deployment Convex (vd `https://xxx.convex.cloud`)
- `CONVEX_ADMIN_KEY`: admin key để backend sync
- `CONVEX_UPSERT_MUTATION`: mutation path upsert (mặc định `masterSync:upsertPlantFromBackend`)
- `CONVEX_DELETE_MUTATION`: mutation path delete (mặc định `masterSync:deletePlantFromBackend`)

## Auth

- Dashboard/API yêu cầu login qua `POST /api/auth/login`
- Nhận JWT rồi gửi `Authorization: Bearer <token>`
- Đã bật rate limit cho endpoint login

## Convex sync

- Mỗi lần tạo/sửa/xóa `master_plants`, backend sẽ gọi Convex mutation tương ứng.
- File Convex tương ứng: `/Users/n/Documents/GitHub/richfarm/convex/masterSync.ts`
- Cần deploy Convex functions sau khi pull code mới:

```bash
cd /Users/n/Documents/GitHub/richfarm
npx convex deploy
```

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
