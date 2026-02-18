# 2026-02-18 — Những gì cần làm hôm nay

> Mục tiêu: Setup foundation cho My Garden MVP — có thể chạy app và hiển thị được màn hình đầu tiên.

---

## ✅ Auto Day List (Checklist theo thứ tự, 1 ngày)

### 1. Khởi động (10 phút)
- [ ] Kiểm tra Node/NPM version
- [ ] `cd my-garden`
- [ ] Xác nhận có `tamagui.config.ts`, `theme.ts`, `docs/convex-schema.ts` ở root

### 2. Cài dependencies (15 phút)
- [ ] Cài Tamagui + Expo Router + Convex + AsyncStorage + Babel plugin
  ```bash
  npm i tamagui @tamagui/config @tamagui/lucide-icons convex expo-router @react-native-async-storage/async-storage @babel/plugin-transform-react-jsx
  ```
- [ ] Xác nhận `package.json` có đủ deps

### 3. Copy config & schema (10 phút)
- [ ] Copy `tamagui.config.ts`, `theme.ts`
- [ ] Copy `docs/convex-schema.ts` → `convex/schema.ts`
  ```bash
  cp ../tamagui.config.ts ./tamagui.config.ts
  cp ../theme.ts ./theme.ts
  cp ../docs/convex-schema.ts ./convex/schema.ts
  ```

### 4. Cấu hình Babel/Expo/Metro (20 phút)
- [ ] Cập nhật `app.json` — thêm scheme + `userInterfaceStyle: "automatic"`
  ```json
  {
    "expo": {
      "scheme": "my-garden",
      "userInterfaceStyle": "automatic",
      "web": {
        "bundler": "metro",
        "favicon": "./assets/favicon.png"
      }
    }
  }
  ```
- [ ] Tạo `babel.config.js` với Tamagui plugin
  ```js
  module.exports = function (api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      plugins: [
        [
          '@tamagui/babel-plugin',
          {
            components: ['tamagui'],
            config: './tamagui.config.ts',
            logTimings: true,
          },
        ],
        'expo-router/babel',
      ],
    };
  };
  ```
- [ ] Tạo `metro.config.js` nếu cần (withTamagui)

### 5. Folder Structure (15 phút)
- [ ] Tạo cấu trúc thư mục:
  ```
  app/
  ├── (auth)/
  │   └── _layout.tsx
  ├── (tabs)/
  │   └── _layout.tsx
  ├── _layout.tsx        ← TamaguiProvider + ConvexProvider
  └── index.tsx          ← Welcome screen
  components/
  ├── ui/
  │   ├── Button.tsx
  │   └── Card.tsx
  └── PlantCard.tsx
  convex/
  ├── schema.ts          ← copy từ docs/convex-schema.ts
  └── README.md
  lib/
  └── convex.ts
  ```

### 6. Tamagui Integration (25 phút)
- [ ] Tạo `app/_layout.tsx` với TamaguiProvider
  ```tsx
  import { TamaguiProvider } from 'tamagui'
  import { config } from '../tamagui.config'
  import { Slot } from 'expo-router'

  export default function RootLayout() {
    return (
      <TamaguiProvider config={config}>
        <Slot />
      </TamaguiProvider>
    )
  }
  ```
- [ ] Test theme colors hiển thị đúng (accent green từ `theme.ts`)
- [ ] Verify dark/light mode toggle (`userInterfaceStyle: "automatic"`)

### 7. Convex Setup (35 phút)
- [ ] Đăng ký account tại convex.dev nếu chưa có
- [ ] Chạy `npx convex dev` để init Convex project (tạo `.env.local`)
- [ ] Copy `docs/convex-schema.ts` → `convex/schema.ts`
- [ ] Tạo `lib/convex.ts`
  ```ts
  import { ConvexReactClient } from 'convex/react'
  export const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!)
  ```
- [ ] Wrap app với `ConvexProvider` trong `_layout.tsx`
- [ ] Test connection: tạo 1 query đơn giản `convex/queries.ts`

### 8. First Screen — Welcome (20 phút)
- [ ] Tạo `app/index.tsx` hiển thị welcome screen
- [ ] Dùng Tamagui components: `YStack`, `Text`, `Button`
- [ ] Style với theme colors (accent green)
- [ ] Thêm navigation button → vào app (tabs)

### 9. Run & Verify (15 phút)
- [ ] `npx expo start --clear`
- [ ] App chạy trên simulator/device
- [ ] Welcome screen đúng màu theme
- [ ] Console không lỗi Convex

### 10. Git Commit (15 phút)
- [ ] Init git repo nếu chưa: `git init`
- [ ] Tạo `.gitignore` — exclude `node_modules/`, `.env.local`, `.convex/`
- [ ] Commit: `feat: initial setup with Expo + Tamagui + Convex`
- [ ] Push lên remote

---

## 📦 Artifacts cần có cuối ngày (Definition of Done)

1. **App chạy được** trên simulator/device (`npx expo start`)
2. **Màn hình welcome** hiển thị đúng màu theme (accent green)
3. **Convex connected** — console không lỗi, `EXPO_PUBLIC_CONVEX_URL` đã set
4. **Repo pushed** — backup sẵn sàng

---

## 🚨 Blockers có thể gặp

| Vấn đề | Cách xử lý |
|--------|-----------|
| Tamagui build lỗi | Check `@tamagui/config` version, xóa `node_modules` reinstall |
| Tamagui + Expo Router conflict | Đảm bảo `expo-router/babel` đứng sau `@tamagui/babel-plugin` |
| Convex chưa có account | Đăng ký convex.dev trước khi chạy `npx convex dev` |
| `CONVEX_URL` không load | Dùng prefix `EXPO_PUBLIC_` cho Expo env vars |
| Metro bundler lỗi | Chạy `npx expo start --clear` |
| TypeScript errors | Tạm thời giảm strict trong `tsconfig.json` |
| `searchIndex` trên `commonNames` (array) | Convex không hỗ trợ search trên array field — flatten hoặc dùng filter thay thế |

---

## 📝 Notes cho ngày mai

Nếu hoàn thành sớm, có thể bắt đầu:
- Auth screens (Login/Register UI)
- Convex Auth integration (Clerk hoặc Convex Auth built-in)
- Onboarding flow (Zone selection)
- Seed data cho `plantsMaster` (10–20 cây phổ biến VN)

---

**Bắt đầu làm việc:** ___:___  
**Nghỉ giải lao:** ___:___  
**Kết thúc:** ___:___

**Tâm trạng:** 😄 / 😐 / 😫
