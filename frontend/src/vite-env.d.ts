/// <reference types="vite/client" />
//
// Vite 客户端环境类型增强。引入这个 reference 后，TS 才知道
// `import.meta.env.VITE_API_URL` 之类的字段存在（由 Vite 在 build
// 阶段注入）。本项目目前在 `api/client.ts` 与 `SelfMadeGalleryPanel.tsx`
// 中读 `import.meta.env`。2026-05-21 §9.2 #15 清理时补齐。
