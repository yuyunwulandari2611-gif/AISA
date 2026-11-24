import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createServer as createViteServer } from 'vite';
import {
  addStudent,
  appendAntiCheatLog,
  authenticateStudent,
  DEFAULT_SITE_SETTINGS,
  deleteAssessmentById,
  deleteQuestionById,
  deleteQuestionsByAssessmentId,
  deleteStaffById,
  deleteStudentById,
  getIntegrationStatus,
  getSiteSettings,
  getSubmissionById,
  invalidateDbCache,
  loadDb,
  markSubmissionsBackedUpBatch,
  removeDriveAsset,
  saveDriveAsset,
  saveSiteSettings,
  saveSubmission,
  upsertAssessment,
  upsertQuestion,
  upsertQuestionsBatch,
  upsertStaff,
} from './src/server/db.ts';
import {
  computeDomainBreakdown,
  computePredicate,
  gradeQuestion,
} from './src/server/grading.ts';
import {
  buildCsvTemplateString,
  buildExcelTemplateBuffer,
  buildTextTemplateString,
  convertDraftToQuestion,
  parseQuestionsDocument,
  parseStructuredText,
  type ParsedQuestionDraft,
} from './src/server/documentParser.ts';
import {
  GOOGLE_APPS_SCRIPT_CODE,
  SUPABASE_SQL_SCHEMA,
} from './src/server/templates.ts';
import type {
  AntiCheatLog,
  Assessment,
  DriveAsset,
  Question,
  SafeQuestion,
  SessionUser,
  SiteSettings,
  StudentAnswerPayload,
  SubmissionRecord,
} from './src/types/cbt.ts';

const PORT = Number(process.env.PORT || 3000);
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function uploadMediaToDriveAndLocal(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  uploadedBy: string;
  idPrefix?: string;
}): Promise<{ asset: DriveAsset; gasSynced: boolean; gasConfigured: boolean }> {
  const cleanBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const safeName = `${Date.now()}_${sanitizeFilename(params.fileName)}`;
  ensureUploadsDir();
  fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
  const localUrl = `/uploads/${safeName}`;

  const mediaKind: DriveAsset['mediaKind'] = params.mimeType.startsWith('image/')
    ? 'image'
    : params.mimeType.startsWith('video/')
      ? 'video'
      : 'document';

  let asset: DriveAsset = {
    id: `${params.idPrefix || 'drv'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: params.fileName,
    mimeType: params.mimeType,
    mediaKind,
    sizeBytes: buffer.byteLength,
    url: localUrl,
    source: 'local_madrasah',
    uploadedBy: params.uploadedBy || 'Guru/Admin',
    createdAt: new Date().toISOString(),
  };

  const gasUrl = process.env.GAS_DRIVE_WEBAPP_URL;
  const gasSecret = process.env.GAS_API_SECRET || '';
  const gasConfigured = Boolean(gasUrl);
  let gasSynced = false;

  if (gasUrl) {
    try {
      const gasRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'uploadMedia',
          secret: gasSecret,
          fileName: params.fileName,
          mimeType: params.mimeType,
          base64Data: cleanBase64,
          uploadedBy: params.uploadedBy || 'Guru/Admin',
        }),
      });
      if (gasRes.ok) {
        const json = (await gasRes.json()) as { ok?: boolean; file?: DriveAsset };
        if (json.ok && json.file) {
          asset = {
            ...json.file,
            driveUrl: json.file.url,
            // Keep localUrl playable instantly in sandbox while preserving driveFileId & driveUrl
            url: localUrl,
          };
          gasSynced = true;
        }
      }
    } catch (gasErr) {
      console.warn('GAS upload fallback to local:', gasErr);
    }
  }

  await saveDriveAsset(asset);
  invalidateGasListCache();
  return { asset, gasSynced, gasConfigured };
}

// Automatically offload any inline `data:image/...;base64,...` to /uploads & GAS Drive
// so large binary strings are never stored inside Supabase Postgres text/JSONB columns.
async function normalizeMediaUrl(
  rawUrl: string | undefined,
  uploadedBy: string,
  namePrefix: string
): Promise<string | undefined> {
  if (!rawUrl) return rawUrl;
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return trimmed;
  const mimeType = match[1];
  const ext = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : mimeType.includes('gif')
        ? 'gif'
        : 'jpg';
  const fileName = `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { asset } = await uploadMediaToDriveAndLocal({
    fileName,
    mimeType,
    base64Data: trimmed,
    uploadedBy,
    idPrefix: 'drv-auto',
  });
  return asset.url;
}

const GAS_LIST_CACHE_TTL_MS = 60 * 1000;
let cachedGasFiles: { files: DriveAsset[]; gasReachable: boolean; fetchedAt: number } | null = null;
function invalidateGasListCache() {
  cachedGasFiles = null;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function startServer() {
  ensureUploadsDir();
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  // Lightweight gzip compression for JSON API payloads >= 1 KB
  app.use('/api', (req, res, next) => {
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    if (!acceptEncoding.includes('gzip')) {
      return next();
    }
    const origJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const jsonStr = JSON.stringify(body);
      if (jsonStr.length < 1024) {
        return origJson(body);
      }
      zlib.gzip(Buffer.from(jsonStr, 'utf-8'), (err, compressed) => {
        if (err || res.headersSent) {
          return origJson(body);
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(compressed);
      });
      return res;
    }) as typeof res.json;
    next();
  });

  // Serve generated media and uploaded attachments with browser cache headers
  app.use(
    '/media',
    express.static(path.resolve(process.cwd(), 'public', 'media'), {
      maxAge: '7d',
      etag: true,
    })
  );
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      etag: true,
    })
  );
  app.use(
    '/src/assets',
    express.static(path.resolve(process.cwd(), 'src', 'assets'), {
      maxAge: '7d',
      etag: true,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'cbt-mi-maarif-al-ihsan-soborejo' });
  });

  app.post('/api/cache/refresh', async (req, res) => {
    const actorRole = String(req.headers['x-user-role'] || '');
    if (actorRole !== 'admin' && actorRole !== 'guru') {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    invalidateDbCache();
    invalidateGasListCache();
    await loadDb({ forceFresh: true });
    res.json({ ok: true });
  });

  app.get('/api/integrations/status', (_req, res) => {
    res.json({
      status: getIntegrationStatus(),
      supabaseSql: SUPABASE_SQL_SCHEMA,
      gasCode: GOOGLE_APPS_SCRIPT_CODE,
    });
  });

  // Site & Landing Page Settings (Public read for LoginPage, Admin-only write)
  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getSiteSettings();
      res.json({ settings });
    } catch (err) {
      console.error('Get settings error:', err);
      res.json({ settings: DEFAULT_SITE_SETTINGS });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      if (actorRole !== 'admin') {
        return res.status(403).json({
          error: 'Akses ditolak: pengaturan tampilan halaman awal hanya diperbolehkan untuk Administrator.',
        });
      }
      const body = req.body as Partial<SiteSettings> & { reset?: boolean };
      if (body.reset) {
        const saved = await saveSiteSettings({ ...DEFAULT_SITE_SETTINGS });
        return res.json({ settings: saved });
      }
      const current = await getSiteSettings();
      const safeLogoUrl =
        body.logoUrl !== undefined
          ? (await normalizeMediaUrl(String(body.logoUrl), 'Administrator', 'logo')) ?? ''
          : current.logoUrl;
      const safeBgUrl =
        body.backgroundImageUrl !== undefined
          ? (await normalizeMediaUrl(String(body.backgroundImageUrl), 'Administrator', 'bg')) ?? ''
          : current.backgroundImageUrl;
      const saved = await saveSiteSettings({
        ...current,
        appName: body.appName !== undefined ? String(body.appName).trim() || DEFAULT_SITE_SETTINGS.appName : current.appName,
        schoolName: body.schoolName !== undefined ? String(body.schoolName).trim() || DEFAULT_SITE_SETTINGS.schoolName : current.schoolName,
        tagline: body.tagline !== undefined ? String(body.tagline).trim() : current.tagline,
        eyebrowText: body.eyebrowText !== undefined ? String(body.eyebrowText).trim() : current.eyebrowText,
        heroTitle: body.heroTitle !== undefined ? String(body.heroTitle).trim() || DEFAULT_SITE_SETTINGS.heroTitle : current.heroTitle,
        heroSubtitle: body.heroSubtitle !== undefined ? String(body.heroSubtitle).trim() : current.heroSubtitle,
        loginHeading: body.loginHeading !== undefined ? String(body.loginHeading).trim() || DEFAULT_SITE_SETTINGS.loginHeading : current.loginHeading,
        logoUrl: safeLogoUrl,
        backgroundImageUrl: safeBgUrl,
        showQuickDemo: body.showQuickDemo !== undefined ? Boolean(body.showQuickDemo) : current.showQuickDemo,
        updatedAt: new Date().toISOString(),
      });
      res.json({ settings: saved });
    } catch (err) {
      console.error('Save settings error:', err);
      res.status(500).json({ error: 'Gagal menyimpan pengaturan halaman awal.' });
    }
  });

  // Authentication for 3 roles: student (peserta ujian), guru, admin (supports unified auto-detect)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { role, identifier, secret } = req.body as {
        role?: 'student' | 'guru' | 'admin' | 'auto';
        identifier: string;
        secret: string;
      };
      const cleanId = (identifier || '').trim();
      const cleanSecret = (secret || '').trim();

      if (role === 'student') {
        // Targeted 1-row lookup on cold start instead of loading all 6 tables
        const student = await authenticateStudent(cleanId, cleanSecret);
        if (!student) {
          return res.status(401).json({
            error: 'NISN atau PIN peserta tidak sesuai. Periksa kartu peserta ujian Anda.',
          });
        }
        const session: SessionUser = {
          id: student.id,
          role: 'student',
          identifier: student.nisn,
          name: student.name,
          className: student.className,
        };
        return res.json({ user: session });
      }

      const db = await loadDb();

      if (!role || role === 'auto') {
        const student = await authenticateStudent(cleanId, cleanSecret);
        if (student) {
          const session: SessionUser = {
            id: student.id,
            role: 'student',
            identifier: student.nisn,
            name: student.name,
            className: student.className,
          };
          return res.json({ user: session });
        }

        const staff = db.admins.find(
          (a) =>
            a.username.toLowerCase() === cleanId.toLowerCase() &&
            a.password === cleanSecret
        );
        if (staff) {
          const session: SessionUser = {
            id: staff.id,
            role: staff.role,
            identifier: staff.username,
            name: staff.name,
            title: staff.title,
            subjectArea: staff.subjectArea,
          };
          return res.json({ user: session });
        }

        return res.status(401).json({
          error: 'NISN/Username atau PIN/Kata Sandi tidak sesuai. Periksa kembali akun Anda.',
        });
      }

      if (role === 'guru' || role === 'admin') {
        const staff = db.admins.find(
          (a) =>
            a.username.toLowerCase() === cleanId.toLowerCase() &&
            a.password === cleanSecret &&
            a.role === role
        );
        if (!staff) {
          return res.status(401).json({
            error:
              role === 'admin'
                ? 'Username atau kata sandi Administrator tidak valid.'
                : 'Username atau kata sandi Guru Pengampu tidak valid.',
          });
        }
        const session: SessionUser = {
          id: staff.id,
          role: staff.role,
          identifier: staff.username,
          name: staff.name,
          title: staff.title,
          subjectArea: staff.subjectArea,
        };
        return res.json({ user: session });
      }

      return res.status(400).json({ error: 'Peran login tidak dikenali.' });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Gagal memproses login.' });
    }
  });

  // Assessments listing
  app.get('/api/assessments', async (req, res) => {
    try {
      const role = String(req.query.role || 'student');
      const studentNisn = String(req.query.studentNisn || '');
      const teacherId = String(req.query.teacherId || req.headers['x-user-id'] || '').trim();
      const db = await loadDb();

      let assessments = db.assessments;
      if (role === 'student') {
        const studentRecord = db.students.find((s) => s.nisn === studentNisn);
        const studentClass = studentRecord?.className || String(req.query.className || '');
        const gradeMatch = studentClass.match(/Kelas\s*(\d+)/i);
        const studentGradeToken = gradeMatch ? `Kelas ${gradeMatch[1]}` : '';
        assessments = db.assessments.filter((a) => {
          if (a.status !== 'active') return false;
          if (!studentGradeToken || a.gradeLevel === 'Semua Kelas') return true;
          return a.gradeLevel.toLowerCase().includes(studentGradeToken.toLowerCase());
        });
      } else if (role === 'guru') {
        assessments = teacherId
          ? db.assessments.filter((a) => a.assignedTeacherId === teacherId)
          : [];
      }

      const enriched = assessments.map((a) => {
        const qList = db.questions.filter((q) => q.assessmentId === a.id);
        const subs = db.submissions.filter((s) => s.assessmentId === a.id);
        const mySubmission = studentNisn
          ? subs.find((s) => s.studentNisn === studentNisn)
          : undefined;
        const { token, ...safeAssessment } = a;
        return {
          ...(role === 'student' ? safeAssessment : a),
          questionCount: qList.length,
          submissionCount: subs.length,
          mySubmission: mySubmission || null,
        };
      });

      res.json({ assessments: enriched });
    } catch (err) {
      console.error('Get assessments error:', err);
      res.status(500).json({ error: 'Gagal memuat daftar asesmen.' });
    }
  });

  app.post('/api/assessments', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      if (actorRole !== 'admin') {
        return res.status(403).json({
          error: 'Akses ditolak: pengaturan jadwal & penugasan mapel hanya diperbolehkan untuk Administrator.',
        });
      }
      const payload = req.body as Assessment;
      if (!payload.title || !payload.token || !payload.assignedTeacherId) {
        return res.status(400).json({
          error: 'Judul asesmen, token sesi, dan guru pengampu yang ditugaskan wajib diisi.',
        });
      }
      const db = await loadDb();
      const teacher = db.admins.find(
        (a) => a.id === payload.assignedTeacherId && a.role === 'guru'
      );
      const saved = await upsertAssessment({
        ...payload,
        id: payload.id || `asm-${Date.now()}`,
        token: payload.token.trim().toUpperCase(),
        assignedTeacherName: teacher?.name || payload.assignedTeacherName || 'Guru Pengampu',
        createdAt: payload.createdAt || new Date().toISOString(),
      });
      res.json({ assessment: saved });
    } catch (err) {
      console.error('Save assessment error:', err);
      res.status(500).json({ error: 'Gagal menyimpan jadwal penugasan asesmen.' });
    }
  });

  app.delete('/api/assessments/:id', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      if (actorRole !== 'admin') {
        return res.status(403).json({
          error: 'Akses ditolak: penghapusan jadwal asesmen hanya diperbolehkan untuk Administrator.',
        });
      }
      await deleteAssessmentById(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete assessment error:', err);
      res.status(500).json({ error: 'Gagal menghapus asesmen.' });
    }
  });

  // Verify exam token & serve safe questions (no answer keys!)
  app.post('/api/assessments/:id/verify-token', async (req, res) => {
    try {
      const { token, studentNisn } = req.body as {
        token: string;
        studentNisn: string;
      };
      const db = await loadDb();
      const assessment = db.assessments.find((a) => a.id === req.params.id);
      if (!assessment) {
        return res.status(404).json({ error: 'Asesmen tidak ditemukan.' });
      }
      if (assessment.status !== 'active') {
        return res.status(403).json({ error: 'Asesmen ini belum diaktifkan oleh proktor.' });
      }
      if (assessment.token.toUpperCase() !== (token || '').trim().toUpperCase()) {
        return res.status(401).json({ error: 'Token sesi ujian salah. Silakan cek papan pengumuman proktor.' });
      }

      const existingSub = db.submissions.find(
        (s) => s.assessmentId === assessment.id && s.studentNisn === studentNisn
      );
      if (existingSub && existingSub.isLocked) {
        return res.status(423).json({
          error:
            'Sesi ujian Anda dikunci karena pelanggaran keamanan anti-kecurangan. Hubungi Guru atau Proktor untuk membuka kunci.',
        });
      }
      if (existingSub) {
        return res.status(409).json({
          error: 'Anda sudah menyelesaikan asesmen ini.',
          submission: existingSub,
        });
      }

      let qList = db.questions
        .filter((q) => q.assessmentId === assessment.id)
        .sort((a, b) => a.orderNumber - b.orderNumber);

      if (assessment.shuffleQuestions) {
        qList = shuffleArray(qList);
      }

      const safeQuestions: SafeQuestion[] = qList.map((q) => ({
        id: q.id,
        assessmentId: q.assessmentId,
        orderNumber: q.orderNumber,
        type: q.type,
        domain: q.domain,
        cognitiveLevel: q.cognitiveLevel,
        stimulusTitle: q.stimulusTitle,
        stimulusPassage: q.stimulusPassage,
        imageUrl: q.imageUrl,
        imageCaption: q.imageCaption,
        videoUrl: q.videoUrl,
        videoCaption: q.videoCaption,
        prompt: q.prompt,
        options: assessment.shuffleQuestions && q.type === 'pg' ? shuffleArray(q.options) : q.options,
        maxPoints: q.maxPoints,
      }));

      res.json({
        assessment,
        questions: safeQuestions,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Verify token error:', err);
      res.status(500).json({ error: 'Gagal memverifikasi token asesmen.' });
    }
  });

  // Questions CRUD & Import Dokumen: khusus untuk Guru Pengampu sesuai jadwal penugasan
  app.get('/api/questions/import-template', (req, res) => {
    try {
      const format = String(req.query.format || 'xlsx').toLowerCase();
      if (format === 'csv') {
        const csv = buildCsvTemplateString();
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="Template_Bank_Soal_AISA.csv"'
        );
        return res.send(csv);
      }
      if (format === 'txt') {
        const txt = buildTextTemplateString();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="Template_Bank_Soal_AISA.txt"'
        );
        return res.send(txt);
      }
      const buf = buildExcelTemplateBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Template_Bank_Soal_AISA.xlsx"'
      );
      return res.send(buf);
    } catch (err) {
      console.error('Template download error:', err);
      return res.status(500).json({ error: 'Gagal membuat template dokumen soal.' });
    }
  });

  app.post('/api/questions/parse-document', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      const actorId = String(req.headers['x-user-id'] || '');
      if (actorRole !== 'guru') {
        return res.status(403).json({
          error: 'Akses ditolak: impor dokumen soal hanya diperbolehkan untuk Guru Pengampu.',
        });
      }

      const { assessmentId, fileName, base64Data, rawText } = req.body as {
        assessmentId: string;
        fileName?: string;
        base64Data?: string;
        rawText?: string;
      };

      if (!assessmentId) {
        return res.status(400).json({ error: 'ID asesmen tujuan wajib dipilih.' });
      }

      const db = await loadDb();
      const targetAsm = db.assessments.find((a) => a.id === assessmentId);
      if (!targetAsm) {
        return res.status(404).json({ error: 'Jadwal asesmen tidak ditemukan.' });
      }
      if (targetAsm.assignedTeacherId && targetAsm.assignedTeacherId !== actorId) {
        return res.status(403).json({
          error: `Akses ditolak: jadwal mapel ini ditugaskan kepada ${targetAsm.assignedTeacherName || 'guru lain'}.`,
        });
      }

      const existingCount = db.questions.filter((q) => q.assessmentId === assessmentId).length;
      const teacher = db.admins.find((a) => a.id === actorId);
      const uploadedAssets: DriveAsset[] = [];

      if (rawText && rawText.trim().length > 0) {
        const drafts = parseStructuredText(rawText, existingCount + 1);
        return res.json({
          result: {
            format: 'TEKS',
            questions: drafts,
            embeddedImagesCount: 0,
            summary: {
              total: drafts.length,
              pg: drafts.filter((d) => d.type === 'pg').length,
              pgk: drafts.filter((d) => d.type === 'pgk').length,
              essay: drafts.filter((d) => d.type === 'essay').length,
            },
          },
          uploadedAssets,
        });
      }

      if (!fileName || !base64Data) {
        return res.status(400).json({ error: 'Berkas dokumen atau teks soal wajib disediakan.' });
      }

      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(cleanBase64, 'base64');

      const result = await parseQuestionsDocument({
        fileName,
        buffer,
        startingOrderNumber: existingCount + 1,
        onSaveEmbeddedImage: async (imgBase64, mimeType) => {
          const ext = mimeType.includes('png')
            ? 'png'
            : mimeType.includes('webp')
              ? 'webp'
              : mimeType.includes('gif')
                ? 'gif'
                : 'jpg';
          const imgName = `docx_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const { asset } = await uploadMediaToDriveAndLocal({
            fileName: imgName,
            mimeType,
            base64Data: imgBase64,
            uploadedBy: teacher?.name || 'Guru Pengampu',
            idPrefix: 'drv-imp',
          });
          uploadedAssets.push(asset);
          return asset.url;
        },
      });

      return res.json({ result, uploadedAssets });
    } catch (err) {
      console.error('Parse document error:', err);
      return res.status(500).json({
        error: 'Gagal membaca dokumen soal. Pastikan format file (.docx, .xlsx, .csv, .txt, .json) tidak rusak.',
      });
    }
  });

  app.post('/api/questions/bulk', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      const actorId = String(req.headers['x-user-id'] || '');
      if (actorRole !== 'guru') {
        return res.status(403).json({
          error: 'Akses ditolak: impor butir soal hanya diperbolehkan untuk Guru Pengampu.',
        });
      }

      const { assessmentId, drafts, mode } = req.body as {
        assessmentId: string;
        drafts: ParsedQuestionDraft[];
        mode?: 'append' | 'replace';
      };

      if (!assessmentId || !Array.isArray(drafts) || drafts.length === 0) {
        return res.status(400).json({ error: 'Daftar butir soal hasil impor tidak boleh kosong.' });
      }

      const db = await loadDb();
      const targetAsm = db.assessments.find((a) => a.id === assessmentId);
      if (!targetAsm) {
        return res.status(404).json({ error: 'Jadwal asesmen tidak ditemukan.' });
      }
      if (targetAsm.assignedTeacherId && targetAsm.assignedTeacherId !== actorId) {
        return res.status(403).json({
          error: `Akses ditolak: jadwal mapel ini ditugaskan kepada ${targetAsm.assignedTeacherName || 'guru lain'}.`,
        });
      }

      if (mode === 'replace') {
        await deleteQuestionsByAssessmentId(assessmentId);
      }

      const teacher = db.admins.find((a) => a.id === actorId);
      const authorName = teacher?.name || targetAsm.assignedTeacherName || 'Guru Pengampu';
      const preparedQuestions: Question[] = [];

      for (let i = 0; i < drafts.length; i++) {
        const q = convertDraftToQuestion(
          drafts[i],
          {
            assessmentId,
            authorId: actorId || teacher?.id || 'guru-1',
            authorName,
          },
          i
        );
        if (q.imageUrl) {
          q.imageUrl = await normalizeMediaUrl(q.imageUrl, authorName, 'q_imp');
        }
        preparedQuestions.push(q);
      }

      await upsertQuestionsBatch(preparedQuestions);

      const refreshedDb = await loadDb();
      const allForAsm = refreshedDb.questions
        .filter((q) => q.assessmentId === assessmentId)
        .sort((a, b) => a.orderNumber - b.orderNumber);

      return res.json({ count: preparedQuestions.length, questions: allForAsm });
    } catch (err) {
      console.error('Bulk import questions error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan soal hasil impor dokumen.' });
    }
  });

  app.get('/api/questions/:assessmentId', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      const actorId = String(req.headers['x-user-id'] || '').trim();
      const db = await loadDb();
      if (actorRole === 'guru') {
        const targetAsm = db.assessments.find((a) => a.id === req.params.assessmentId);
        if (!targetAsm || !actorId || targetAsm.assignedTeacherId !== actorId) {
          return res.status(403).json({
            error: 'Akses ditolak: Anda hanya dapat melihat soal pada jadwal penugasan Anda sendiri.',
          });
        }
      }
      const questions = db.questions
        .filter((q) => q.assessmentId === req.params.assessmentId)
        .sort((a, b) => a.orderNumber - b.orderNumber);
      res.json({ questions });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memuat bank soal.' });
    }
  });

  app.post('/api/questions', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      const actorId = String(req.headers['x-user-id'] || '');
      if (actorRole !== 'guru') {
        return res.status(403).json({
          error: 'Akses ditolak: pembuatan dan penyuntingan butir soal hanya diperbolehkan untuk Guru Pengampu.',
        });
      }
      const payload = req.body as Question;
      const cleanPrompt = (payload.prompt || '').trim();
      const hasImage = Boolean(payload.imageUrl && payload.imageUrl.trim());
      if (!payload.assessmentId || (!cleanPrompt && !hasImage)) {
        return res.status(400).json({ error: 'Asesmen dan pertanyaan atau gambar soal wajib diisi.' });
      }
      const db = await loadDb();
      const targetAsm = db.assessments.find((a) => a.id === payload.assessmentId);
      if (!targetAsm) {
        return res.status(404).json({ error: 'Jadwal asesmen tidak ditemukan.' });
      }
      if (targetAsm.assignedTeacherId && targetAsm.assignedTeacherId !== actorId) {
        return res.status(403).json({
          error: `Akses ditolak: jadwal mapel ini ditugaskan kepada ${targetAsm.assignedTeacherName || 'guru lain'}. Anda hanya dapat membuat soal sesuai jadwal penugasan Anda.`,
        });
      }
      const teacherName = payload.authorName || targetAsm.assignedTeacherName || 'Guru Pengampu';
      const safeQuestionImage = await normalizeMediaUrl(payload.imageUrl, teacherName, 'q_img');
      const safeOptions = await Promise.all(
        (payload.options || []).map(async (opt) => ({
          ...opt,
          imageUrl: opt.imageUrl
            ? await normalizeMediaUrl(opt.imageUrl, teacherName, `opt_${opt.label || 'x'}`)
            : undefined,
        }))
      );
      const saved = await upsertQuestion({
        ...payload,
        imageUrl: safeQuestionImage,
        options: safeOptions,
        prompt: cleanPrompt || 'Perhatikan gambar soal berikut dengan saksama.',
        id: payload.id || `q-${Date.now()}`,
        maxPoints: Number(payload.maxPoints || 10),
        orderNumber: Number(payload.orderNumber || 1),
      });
      res.json({ question: saved });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menyimpan butir soal.' });
    }
  });

  app.delete('/api/questions/:id', async (req, res) => {
    try {
      const actorRole = String(req.headers['x-user-role'] || '');
      const actorId = String(req.headers['x-user-id'] || '');
      if (actorRole !== 'guru') {
        return res.status(403).json({
          error: 'Akses ditolak: penghapusan butir soal hanya diperbolehkan untuk Guru Pengampu.',
        });
      }
      const db = await loadDb();
      const targetQ = db.questions.find((q) => q.id === req.params.id);
      if (targetQ) {
        const targetAsm = db.assessments.find((a) => a.id === targetQ.assessmentId);
        if (targetAsm?.assignedTeacherId && targetAsm.assignedTeacherId !== actorId) {
          return res.status(403).json({
            error: 'Akses ditolak: Anda hanya dapat menghapus soal pada jadwal penugasan Anda sendiri.',
          });
        }
      }
      await deleteQuestionById(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menghapus soal.' });
    }
  });

  // Automated Grading & Instant Gradebook Submission
  app.post('/api/exam/submit', async (req, res) => {
    try {
      const {
        assessmentId,
        studentId,
        studentNisn,
        studentName,
        className,
        startedAt,
        durationSeconds,
        violationCount,
        autoSubmittedBySecurity,
        answers,
      } = req.body as {
        assessmentId: string;
        studentId: string;
        studentNisn: string;
        studentName: string;
        className: string;
        startedAt: string;
        durationSeconds: number;
        violationCount: number;
        autoSubmittedBySecurity: boolean;
        answers: StudentAnswerPayload[];
      };

      const db = await loadDb();
      const assessment = db.assessments.find((a) => a.id === assessmentId);
      if (!assessment) {
        return res.status(404).json({ error: 'Asesmen tidak ditemukan.' });
      }

      const questions = db.questions
        .filter((q) => q.assessmentId === assessmentId)
        .sort((a, b) => a.orderNumber - b.orderNumber);

      const answerMap = new Map<string, StudentAnswerPayload>();
      for (const ans of answers || []) {
        answerMap.set(ans.questionId, ans);
      }

      const gradedItems = questions.map((q) => gradeQuestion(q, answerMap.get(q.id)));
      const totalPointsEarned =
        Math.round(gradedItems.reduce((acc, i) => acc + i.earnedPoints, 0) * 100) / 100;
      const totalPointsMax = gradedItems.reduce((acc, i) => acc + i.maxPoints, 0);
      const finalScore =
        totalPointsMax > 0
          ? Math.round((totalPointsEarned / totalPointsMax) * 1000) / 10
          : 0;

      const status = getIntegrationStatus();
      const record: SubmissionRecord = {
        id: `sub-${Date.now()}-${studentNisn}`,
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
        studentId,
        studentNisn,
        studentName,
        className,
        startedAt: startedAt || new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        durationSeconds: Number(durationSeconds || 0),
        violationCount: Number(violationCount || 0),
        autoSubmittedBySecurity: Boolean(autoSubmittedBySecurity),
        isLocked: Boolean(autoSubmittedBySecurity),
        totalPointsEarned,
        totalPointsMax,
        finalScore,
        predicate: computePredicate(finalScore),
        domainBreakdown: computeDomainBreakdown(gradedItems),
        gradedItems,
        syncedToSupabase: status.supabaseConfigured,
        backedUpToDrive: false,
      };

      await saveSubmission(record);
      res.json({ submission: record });
    } catch (err) {
      console.error('Submit exam error:', err);
      res.status(500).json({ error: 'Gagal menilai dan menyimpan hasil ujian.' });
    }
  });

  // Submissions / Instant Gradebook
  app.get('/api/submissions', async (req, res) => {
    try {
      const studentNisn = req.query.studentNisn ? String(req.query.studentNisn) : null;
      const role = String(req.query.role || req.headers['x-user-role'] || '');
      const teacherId = String(req.query.teacherId || req.headers['x-user-id'] || '').trim();
      const db = await loadDb();
      let list = studentNisn
        ? db.submissions.filter((s) => s.studentNisn === studentNisn)
        : db.submissions;
      if (role === 'guru' && !studentNisn) {
        const assignedIds = new Set(
          teacherId
            ? db.assessments.filter((a) => a.assignedTeacherId === teacherId).map((a) => a.id)
            : []
        );
        list = list.filter((s) => assignedIds.has(s.assessmentId));
      }
      res.json({ submissions: list });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memuat database nilai.' });
    }
  });

  // Single submission detail (lazy-loads `gradedItems` JSONB from Supabase on demand)
  app.get('/api/submissions/:id', async (req, res) => {
    try {
      const role = String(req.query.role || req.headers['x-user-role'] || '');
      const actorId = String(req.query.teacherId || req.headers['x-user-id'] || '').trim();
      const studentNisn = String(req.query.studentNisn || '').trim();

      const submission = await getSubmissionById(req.params.id);
      if (!submission) {
        return res.status(404).json({ error: 'Data nilai siswa tidak ditemukan.' });
      }

      if (role === 'student' && studentNisn && submission.studentNisn !== studentNisn) {
        return res.status(403).json({ error: 'Akses ditolak.' });
      }
      if (role === 'guru') {
        const db = await loadDb();
        const asm = db.assessments.find((a) => a.id === submission.assessmentId);
        if (!asm || !actorId || asm.assignedTeacherId !== actorId) {
          return res.status(403).json({ error: 'Akses ditolak.' });
        }
      }

      res.json({ submission });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memuat rincian nilai.' });
    }
  });

  // Teacher/Admin calibration for essays or unlocking auto-locked sessions
  app.patch('/api/submissions/:id/calibrate', async (req, res) => {
    try {
      const { gradedItems, unlockSession } = req.body as {
        gradedItems?: SubmissionRecord['gradedItems'];
        unlockSession?: boolean;
      };
      const existing = await getSubmissionById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Data nilai siswa tidak ditemukan.' });
      }

      const nextItems = gradedItems || existing.gradedItems;
      const totalEarned =
        Math.round(nextItems.reduce((acc, i) => acc + Number(i.earnedPoints || 0), 0) * 100) /
        100;
      const totalMax = nextItems.reduce((acc, i) => acc + Number(i.maxPoints || 0), 0) || existing.totalPointsMax;
      const finalScore =
        totalMax > 0 ? Math.round((totalEarned / totalMax) * 1000) / 10 : existing.finalScore;

      const updated: SubmissionRecord = {
        ...existing,
        gradedItems: nextItems,
        totalPointsEarned: totalEarned,
        totalPointsMax: totalMax,
        finalScore,
        predicate: computePredicate(finalScore),
        domainBreakdown:
          nextItems.length > 0 ? computeDomainBreakdown(nextItems) : existing.domainBreakdown,
        isLocked: unlockSession ? false : existing.isLocked,
      };

      await saveSubmission(updated);
      res.json({ submission: updated });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memperbarui nilai.' });
    }
  });

  // Anti-cheat violation logging
  app.post('/api/anti-cheat/log', async (req, res) => {
    try {
      const payload = req.body as Omit<AntiCheatLog, 'id' | 'timestamp'>;
      const log: AntiCheatLog = {
        ...payload,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      };
      await appendAntiCheatLog(log);
      res.json({ log });
    } catch (err) {
      res.status(500).json({ error: 'Gagal mencatat log keamanan.' });
    }
  });

  app.get('/api/anti-cheat/logs', async (req, res) => {
    try {
      const role = String(req.query.role || req.headers['x-user-role'] || '');
      const teacherId = String(req.query.teacherId || req.headers['x-user-id'] || '').trim();
      const db = await loadDb();
      let logs = db.antiCheatLogs;
      if (role === 'guru') {
        const assignedIds = new Set(
          teacherId
            ? db.assessments.filter((a) => a.assignedTeacherId === teacherId).map((a) => a.id)
            : []
        );
        logs = logs.filter((l) => assignedIds.has(l.assessmentId));
      }
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memuat log pengawas.' });
    }
  });

  // Role & User Account Management (Admin & Guru)
  app.get('/api/users', async (_req, res) => {
    try {
      const db = await loadDb();
      res.json({
        students: db.students,
        staff: db.admins.map(({ password: _p, ...rest }) => rest),
      });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memuat daftar akun.' });
    }
  });

  app.post('/api/users/student', async (req, res) => {
    try {
      const { id, nisn, name, className, pin } = req.body;
      if (!nisn || !name || !className || !pin) {
        return res.status(400).json({ error: 'NISN, nama lengkap, kelas, dan PIN wajib diisi.' });
      }
      const saved = await addStudent({
        id: id || `stu-${Date.now()}`,
        nisn: String(nisn).trim(),
        name: String(name).trim(),
        className: String(className).trim(),
        pin: String(pin).trim(),
      });
      res.json({ student: saved });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menyimpan akun peserta ujian.' });
    }
  });

  app.delete('/api/users/student/:id', async (req, res) => {
    try {
      await deleteStudentById(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menghapus akun peserta.' });
    }
  });

  app.post('/api/users/staff', async (req, res) => {
    try {
      const { id, username, name, title, role, subjectArea, password } = req.body;
      if (!username || !name || !role) {
        return res.status(400).json({ error: 'Username, nama lengkap, dan peran wajib diisi.' });
      }
      const saved = await upsertStaff({
        id: id || `${role}-${Date.now()}`,
        username: String(username).trim(),
        name: String(name).trim(),
        title: String(title || (role === 'admin' ? 'Administrator CBT' : 'Guru Pengampu')).trim(),
        role: role === 'admin' ? 'admin' : 'guru',
        subjectArea: subjectArea ? String(subjectArea).trim() : undefined,
        password: String(password || 'guru2026').trim(),
      });
      const { password: _p, ...safeStaff } = saved;
      res.json({ staff: safeStaff });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menyimpan akun guru/admin.' });
    }
  });

  app.delete('/api/users/staff/:id', async (req, res) => {
    try {
      await deleteStaffById(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menghapus akun staf.' });
    }
  });

  // Google Drive via Google Apps Script Proxy + Local Madrasah Media Gallery
  app.get('/api/drive/files', async (req, res) => {
    try {
      const db = await loadDb();
      const gasUrl = process.env.GAS_DRIVE_WEBAPP_URL;
      const gasSecret = process.env.GAS_API_SECRET || '';
      const forceFresh = req.query.fresh === '1';

      let remoteFiles: DriveAsset[] = [];
      let gasReachable = false;

      if (
        !forceFresh &&
        cachedGasFiles &&
        Date.now() - cachedGasFiles.fetchedAt < GAS_LIST_CACHE_TTL_MS
      ) {
        remoteFiles = cachedGasFiles.files;
        gasReachable = cachedGasFiles.gasReachable;
      } else if (gasUrl) {
        try {
          const url = new URL(gasUrl);
          url.searchParams.set('action', 'list');
          if (gasSecret) url.searchParams.set('secret', gasSecret);
          const response = await fetch(url.toString());
          if (response.ok) {
            const json = (await response.json()) as { ok?: boolean; files?: DriveAsset[] };
            if (json.ok && Array.isArray(json.files)) {
              remoteFiles = json.files;
              gasReachable = true;
            }
          }
        } catch (gasErr) {
          console.warn('GAS Drive list fallback:', gasErr);
        }
        cachedGasFiles = { files: remoteFiles, gasReachable, fetchedAt: Date.now() };
      }

      const merged = [...remoteFiles, ...db.driveAssets];
      res.json({ files: merged, gasReachable });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memuat file media Google Drive.' });
    }
  });

  app.post('/api/drive/upload', async (req, res) => {
    try {
      const { fileName, mimeType, base64Data, uploadedBy } = req.body as {
        fileName: string;
        mimeType: string;
        base64Data: string;
        uploadedBy: string;
      };

      if (!fileName || !mimeType || !base64Data) {
        return res.status(400).json({ error: 'File tidak lengkap untuk diunggah.' });
      }

      const { asset, gasSynced, gasConfigured } = await uploadMediaToDriveAndLocal({
        fileName,
        mimeType,
        base64Data,
        uploadedBy: uploadedBy || 'Guru/Admin',
      });

      res.json({ asset, gasSynced, gasConfigured });
    } catch (err) {
      console.error('Upload media error:', err);
      res.status(500).json({ error: 'Gagal mengunggah media.' });
    }
  });

  app.post('/api/drive/sync-all', async (_req, res) => {
    try {
      const gasUrl = process.env.GAS_DRIVE_WEBAPP_URL;
      const gasSecret = process.env.GAS_API_SECRET || '';
      if (!gasUrl) {
        return res.status(400).json({
          error: 'GAS_DRIVE_WEBAPP_URL belum disetel di Secrets server.',
        });
      }

      const db = await loadDb();
      const pending = db.driveAssets.filter(
        (a) => a.source === 'local_madrasah' && a.url.startsWith('/uploads/')
      );
      let syncedCount = 0;

      for (const item of pending) {
        const relPath = item.url.replace(/^\/uploads\//, '');
        const absPath = path.join(UPLOADS_DIR, relPath);
        if (!fs.existsSync(absPath)) continue;
        const base64Data = fs.readFileSync(absPath).toString('base64');
        const gasRes = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'uploadMedia',
            secret: gasSecret,
            fileName: item.name,
            mimeType: item.mimeType,
            base64Data,
            uploadedBy: item.uploadedBy,
          }),
        });
        if (gasRes.ok) {
          const json = (await gasRes.json()) as { ok?: boolean; file?: DriveAsset };
          if (json.ok && json.file) {
            await removeDriveAsset(item.id);
            await saveDriveAsset({
              ...item,
              driveFileId: json.file.driveFileId,
              driveUrl: json.file.url,
              source: 'google_drive_gas',
            });
            syncedCount += 1;
          }
        }
      }

      res.json({ ok: true, syncedCount });
    } catch (err) {
      console.error('Sync all drive error:', err);
      res.status(500).json({ error: 'Gagal menyinkronkan media ke Google Drive.' });
    }
  });

  app.post('/api/drive/backup-scores', async (req, res) => {
    try {
      const { assessmentId } = req.body as { assessmentId?: string };
      const actorRole = String(req.headers['x-user-role'] || '');
      const actorId = String(req.headers['x-user-id'] || '').trim();
      const db = await loadDb();
      let scopedSubmissions = db.submissions;
      if (actorRole === 'guru') {
        const assignedIds = new Set(
          actorId
            ? db.assessments.filter((a) => a.assignedTeacherId === actorId).map((a) => a.id)
            : []
        );
        scopedSubmissions = scopedSubmissions.filter((s) => assignedIds.has(s.assessmentId));
      }
      const targetSubs = assessmentId && assessmentId !== 'all'
        ? scopedSubmissions.filter((s) => s.assessmentId === assessmentId)
        : scopedSubmissions;

      const header = [
        'NISN',
        'Nama Peserta',
        'Kelas',
        'Asesmen',
        'Nilai Akhir',
        'Predikat',
        'Pelanggaran',
        'Status Keamanan',
        'Waktu Kumpul',
      ].join(',');

      const rows = targetSubs.map((s) =>
        [
          `"${s.studentNisn}"`,
          `"${s.studentName.replace(/"/g, '""')}"`,
          `"${s.className}"`,
          `"${s.assessmentTitle.replace(/"/g, '""')}"`,
          s.finalScore,
          `"${s.predicate}"`,
          s.violationCount,
          `"${s.autoSubmittedBySecurity ? 'Terkunci Otomatis' : s.violationCount > 0 ? 'Peringatan' : 'Bersih'}"`,
          `"${s.submittedAt}"`,
        ].join(',')
      );

      const csvContent = [header, ...rows].join('\n');
      const fileName = `Rekap_Nilai_CBT_Al_Ihsan_${new Date().toISOString().slice(0, 10)}.csv`;

      const gasUrl = process.env.GAS_DRIVE_WEBAPP_URL;
      const gasSecret = process.env.GAS_API_SECRET || '';
      let driveResult: { ok: boolean; driveFileId?: string; url?: string } = { ok: false };

      if (gasUrl) {
        try {
          const gasRes = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'backupScoresCsv',
              secret: gasSecret,
              fileName,
              csvContent,
            }),
          });
          if (gasRes.ok) {
            driveResult = (await gasRes.json()) as {
              ok: boolean;
              driveFileId?: string;
              url?: string;
            };
          }
        } catch (gasErr) {
          console.warn('GAS score backup fallback:', gasErr);
        }
      }

      // Mark records backed up & save local archive copy
      ensureUploadsDir();
      const backupFileName = `${Date.now()}_${fileName}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, backupFileName), csvContent, 'utf-8');

      await saveDriveAsset({
        id: `drv-csv-${Date.now()}`,
        name: fileName,
        mimeType: 'text/csv',
        mediaKind: 'spreadsheet',
        sizeBytes: Buffer.byteLength(csvContent, 'utf-8'),
        url: driveResult.url || `/uploads/${backupFileName}`,
        driveFileId: driveResult.driveFileId,
        source: driveResult.ok ? 'google_drive_gas' : 'local_madrasah',
        uploadedBy: 'Backup Otomatis Nilai',
        createdAt: new Date().toISOString(),
      });

      await markSubmissionsBackedUpBatch(targetSubs.map((s) => s.id));
      invalidateGasListCache();

      res.json({
        ok: true,
        syncedToGas: driveResult.ok,
        fileName,
        count: targetSubs.length,
        downloadUrl: `/uploads/${backupFileName}`,
      });
    } catch (err) {
      console.error('Backup scores error:', err);
      res.status(500).json({ error: 'Gagal mencadangkan nilai ke Google Drive.' });
    }
  });

  app.delete('/api/drive/files/:id', async (req, res) => {
    try {
      const db = await loadDb();
      const target = db.driveAssets.find((d) => d.id === req.params.id);
      const gasUrl = process.env.GAS_DRIVE_WEBAPP_URL;
      const gasSecret = process.env.GAS_API_SECRET || '';

      if (gasUrl && target?.driveFileId) {
        try {
          await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'deleteFile',
              secret: gasSecret,
              driveFileId: target.driveFileId,
            }),
          });
        } catch (gasErr) {
          console.warn('GAS delete warning:', gasErr);
        }
      }

      await removeDriveAsset(req.params.id);
      invalidateGasListCache();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menghapus file.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CBT MI Ma'arif Al Ihsan Soborejo server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
