/**
 * 培训视频库 · 后端服务
 *
 * 功能：
 *  - 静态托管前端（index.html / upload.html / player.html / assets/）
 *  - 课程元数据 CRUD（courses/<id>/course.json）
 *  - 文件上传 / 列表 / 详情 / 删除 API
 *  - 视频/PDF 文件下载
 *
 * 启动：
 *   PORT=3000 ADMIN_TOKEN=your-secret node server.js
 *
 * 管理员鉴权：
 *   - 列出/查看：公开
 *   - 上传/删除：需要 X-Token header 或 ?token=xxx
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mime = require('mime-types');

const ROOT = __dirname;
const COURSES_DIR = path.join(ROOT, 'courses');
const PUBLIC_DIR = ROOT;
const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';

if (!fs.existsSync(COURSES_DIR)) fs.mkdirSync(COURSES_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));

/* ====================== 鉴权中间件 ====================== */
function requireAdmin(req, res, next) {
  const token = req.headers['x-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: '需要管理员 token（设置 X-Token header 或 ?token=）' });
  }
  next();
}

/* ====================== 工具 ====================== */
function newCourseId() {
  return 'c_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

function readCourseMeta(id) {
  const p = path.join(COURSES_DIR, id, 'course.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function listAllCourses() {
  if (!fs.existsSync(COURSES_DIR)) return [];
  return fs.readdirSync(COURSES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const meta = readCourseMeta(d.name);
      if (!meta) return null;
      return {
        id: d.name,
        source: 'builtin',
        title: meta.title,
        instructor: meta.instructor,
        description: meta.description,
        uploadedAt: meta.uploadedAt,
        hasPdf: !!meta.pdf,
        hasVideo: !!meta.video,
        pdfName: meta.pdf,
        videoName: meta.video,
        icon: meta.icon || '🎓',
        fileSize: meta.fileSize || {},
        duration: meta.duration || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
}

function safeJoin(base, ...parts) {
  const target = path.normalize(path.join(base, ...parts));
  if (!target.startsWith(base)) {
    throw new Error('非法路径');
  }
  return target;
}

/* ====================== 静态文件托管 ====================== */
// 课程文件（PDF/视频）：/courses/<id>/<filename>
app.get('/courses/:id/:filename', (req, res) => {
  try {
    const filePath = safeJoin(COURSES_DIR, req.params.id, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('文件不存在');
    const stat = fs.statSync(filePath);
    const type = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    // 视频支持 Range
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunk = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunk);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e) {
    res.status(400).send('非法路径: ' + e.message);
  }
});

// 其它静态资源
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

/* ====================== 课程 API ====================== */

// 列出所有课程
app.get('/api/courses', (req, res) => {
  res.json({ courses: listAllCourses() });
});

// 课程详情
app.get('/api/courses/:id', (req, res) => {
  const meta = readCourseMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: '课程不存在' });
  res.json({
    id: req.params.id,
    source: 'builtin',
    title: meta.title,
    instructor: meta.instructor,
    description: meta.description,
    uploadedAt: meta.uploadedAt,
    pdf: meta.pdf,
    video: meta.video,
    icon: meta.icon || '🎓',
    pdfUrl: meta.pdf ? `/courses/${req.params.id}/${meta.pdf}` : null,
    videoUrl: meta.video ? `/courses/${req.params.id}/${meta.video}` : null,
  });
});

// 上传课程（multipart/form-data）
// 字段：title, instructor, description, icon
// 文件：pdf (optional), video (optional)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const id = newCourseId();
      req._courseId = id;
      const dir = path.join(COURSES_DIR, id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      // 用原始文件名，但去掉路径
      const safe = file.originalname.replace(/[^\w.\-一-龥]/g, '_');
      cb(null, `${file.fieldname}-${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 单文件 1GB
});

app.post('/api/courses', requireAdmin, upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]), (req, res) => {
  const { title, instructor, description, icon } = req.body;
  if (!title) return res.status(400).json({ error: '课程标题必填' });

  const files = req.files || {};
  if (!files.pdf && !files.video) {
    // 清理空目录
    try { fs.rmSync(path.join(COURSES_DIR, req._courseId), { recursive: true }); } catch (e) {}
    return res.status(400).json({ error: '请至少上传讲义或视频中的一个' });
  }

  const id = req._courseId;
  const meta = {
    id,
    title: title.trim(),
    instructor: (instructor || '匿名').trim(),
    description: (description || '').trim(),
    icon: icon || '🎓',
    pdf: files.pdf ? files.pdf[0].filename : null,
    video: files.video ? files.video[0].filename : null,
    uploadedAt: new Date().toISOString().slice(0, 10),
    fileSize: {
      pdf: files.pdf ? files.pdf[0].size : 0,
      video: files.video ? files.video[0].size : 0,
    },
  };
  fs.writeFileSync(path.join(COURSES_DIR, id, 'course.json'), JSON.stringify(meta, null, 2));

  res.json({ success: true, id, course: { ...meta, source: 'builtin', hasPdf: !!meta.pdf, hasVideo: !!meta.video } });
});

// 删除课程
app.delete('/api/courses/:id', requireAdmin, (req, res) => {
  const dir = path.join(COURSES_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: '课程不存在' });
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 启动
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  📚 培训视频库已启动`);
  console.log(`  🌐 访问: http://localhost:${PORT}`);
  console.log(`  🔑 管理员 token: ${ADMIN_TOKEN}  （用环境变量 ADMIN_TOKEN 修改）\n`);
});
