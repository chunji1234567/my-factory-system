# 本地局域网调试指南

为了让手机或其他局域网设备访问开发环境，需要同时开放前端/后端监听并配置正确的 BASE URL。

## 1. 启动后端（Django）
```bash
export DJANGO_DEV_HOST=192.168.21.140  # 替换成你电脑在局域网中的 IP
python manage.py runserver 0.0.0.0:8000
```

- `DJANGO_DEV_HOST` 会自动加入 `ALLOWED_HOSTS`，否则 Django 会拒绝请求。
- 若使用 `.env`，也可以在其中写入 `DJANGO_DEV_HOST=192.168.21.140`。

## 2. 启动前端（Vite）

1. 复制示例环境变量：
   ```bash
   cd frontend
   cp .env.development.example .env.development.local
   # 按实际 IP 修改 VITE_API_BASE_URL
   ```
2. 运行监听所有地址的脚本：
   ```bash
   npm run dev:lan
   ```

这样 Vite 会在 `0.0.0.0:5173` 上监听，并把所有 API 请求发送到 `.env.development.local` 中配置的 IP。

## 3. 手机访问

在手机浏览器中打开 `http://<你的电脑IP>:5173`，即可访问前端并调用同一台机器上的后端。

> 提示：确保手机与电脑在同一 Wi-Fi/局域网下，且没有防火墙阻挡 5173/8000 端口。
