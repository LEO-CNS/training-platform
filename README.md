# 📚 培训视频库 · 完整部署指南

## 一、方案说明

完整的全栈方案 —— **老师上传一次，所有人都能看到**。

```
┌─────────────────────────────────────────────┐
│  浏览器（学员/老师）                          │
└──────────────────┬──────────────────────────┘
                   │ HTTP
┌──────────────────▼──────────────────────────┐
│  Node.js 服务（你的服务器/容器）               │
│  - 静态托管 index.html / upload.html / ...   │
│  - REST API  /api/courses (GET/POST/DELETE) │
│  - 文件下载 /courses/<id>/<file>            │
└──────────────────┬──────────────────────────┘
                   │ 文件系统
┌──────────────────▼──────────────────────────┐
│  ./courses/ 目录                             │
│  ├─ 01/                                      │
│  │  ├─ course.json                           │
│  │  ├─ notes.pdf                             │
│  │  └─ lecture.mp4                           │
│  └─ ...                                      │
└─────────────────────────────────────────────┘
```

## 二、本地启动（开发模式）

```bash
cd training-platform
npm install
PORT=3000 ADMIN_TOKEN=你的密码 node server.js
```

浏览器访问 `http://localhost:3000`，上传页用 `你的密码` 作为 token。

## 三、部署到服务器（生产模式）

### 选项 A · 普通 VPS（阿里云/腾讯云/AWS EC2 等）

1. 把整个 `training-platform/` 目录上传到服务器
2. 服务器装 Node.js 18+
3. 安装依赖：`cd training-platform && npm install --production`
4. 用 PM2 守护：

```bash
npm install -g pm2
ADMIN_TOKEN=你的强密码 PORT=3000 pm2 start server.js --name training
pm2 save && pm2 startup
```

5. Nginx 反向代理（强烈建议）：

```nginx
server {
  listen 80;
  server_name training.your-domain.com;
  client_max_body_size 2G;     # 允许上传大文件

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    proxy_request_buffering off;   # 视频上传不缓冲
    proxy_buffering off;
  }
}
```

6. 配 HTTPS（certbot）：

```bash
sudo certbot --nginx -d training.your-domain.com
```

### 选项 B · Docker

新建 `Dockerfile`：

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
ENV PORT=3000
ENV ADMIN_TOKEN=changeme
CMD ["node", "server.js"]
```

构建并运行：

```bash
docker build -t training-platform .
docker run -d -p 3000:3000 \
  -v $(pwd)/courses:/app/courses \
  -e ADMIN_TOKEN=你的强密码 \
  --name training --restart unless-stopped \
  training-platform
```

### 选项 C · 内网穿透（临时演示，本机直跑）

```bash
# 在 server.js 跑起来后，另开终端
brew install cloudflared   # 或 winget install cloudflared
cloudflared tunnel --url http://localhost:3000
```

cloudflared 会打印一个 `https://xxx.trycloudflare.com` 的公网地址，临时用足够。

## 四、添加新课程

### 方式一：网页上传（推荐）

1. 用浏览器打开 `https://your-domain/upload.html`
2. 第一次会弹窗要求输入 token（部署时设置的 `ADMIN_TOKEN`）
3. 填标题、讲师、简介 → 拖入讲义 PDF + 视频 MP4 → 提交
4. 任何访问者刷新首页就能看到新课程

### 方式二：命令行 / 文件系统

```bash
mkdir -p courses/03
cp my-lecture.pdf courses/03/notes.pdf
cp my-video.mp4   courses/03/lecture.mp4
```

在 `courses/03/course.json` 写元数据：

```json
{
  "id": "03",
  "title": "课程标题",
  "instructor": "讲师",
  "description": "简介",
  "icon": "🎓",
  "pdf": "notes.pdf",
  "video": "lecture.mp4",
  "uploadedAt": "2026-10-12"
}
```

刷新页面即可（无需重启服务）。

## 五、安全与运维

- **必须改 `ADMIN_TOKEN` 默认值**（默认 `admin123` 仅用于本地调试）
- 上传单文件最大 1GB（可在 `server.js` 顶部 `multer` 限制调整）
- 视频和 PDF 走文件流，**支持 Range 请求**，可边下边播
- `courses/` 是数据目录，**备份它就备份了一切**
- 学员不需要 token，只老师上传/删除时用

## 六、API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET    | /api/courses                 | 列出全部课程（公开） |
| GET    | /api/courses/:id             | 课程详情（公开） |
| POST   | /api/courses                 | 上传课程（需 token） |
| DELETE | /api/courses/:id             | 删除课程（需 token） |
| GET    | /courses/:id/:filename       | 文件下载（公开，支持 Range） |

### curl 上传示例

```bash
curl -X POST \
  -H "X-Token: admin123" \
  -F "title=新员工培训" \
  -F "instructor=张老师" \
  -F "description=公司制度与业务入门" \
  -F "pdf=@/path/to/讲义.pdf" \
  -F "video=@/path/to/视频.mp4" \
  http://your-domain:3000/api/courses
```

## 七、目录结构

```
training-platform/
├── server.js                # 后端入口
├── package.json
├── index.html               # 课程列表
├── upload.html              # 上传页（管理员）
├── player.html              # 播放器
├── assets/
│   ├── css/style.css
│   └── js/db.js             # 前端 API 封装
└── courses/
    ├── 01/
    │   ├── course.json
    │   ├── notes.pdf
    │   └── lecture.mp4
    └── 02/...
```

## 八、常见问题

- **看不到上传的视频？** 检查文件是否真的写到 `courses/<id>/`，再看 `course.json` 的 `video` 字段。
- **PPT 不能在线预览？** 浏览器原生不支持 PPTX。在 PowerPoint 里"另存为 PDF"后上传即可，所有页面可翻页、可缩放。
- **上传大文件超时？** Nginx 里加 `client_max_body_size 2G;` 和 `proxy_read_timeout 300s;`。
- **多老师怎么管？** 目前是单 token，所有老师共享。多人协作可把 token 改成网关（OAuth/JWT）。
