# Convex Backend

## Setup

1. Đăng ký tài khoản tại [convex.dev](https://convex.dev)
2. Chạy `npx convex dev` để kết nối project
3. Copy URL từ convex dashboard vào `.env.local`:
   ```
   EXPO_PUBLIC_CONVEX_URL=https://your-url.convex.cloud
   ```

## Schema

Xem `schema.ts` cho định nghĩa database.

## Functions

Tạo thêm functions trong thư mục này:
- `queries.ts` - Read operations
- `mutations.ts` - Write operations  
- `actions.ts` - Side effects, external APIs

## Deploy

```bash
npx convex deploy
```
