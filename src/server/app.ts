import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
  getDetailedIntegrationStatus,
  getGasConfig,
  getIntegrationStatus,
  getSiteSettings,
  getSubmissionById,
  hasAnyAdminAccount,
  invalidateDbCache,
  loadDb,
  markSubmissionsBackedUpBatch,
  removeDriveAsset,
  saveDriveAsset,
  saveGasConfig,
  saveSiteSettings,
  saveSubmission,
  testSupabaseConnection,
  upsertAssessment,
  upsertQuestion,
  upsertQuestionsBatch,
  upsertStaff,
  verifyPassword,
} from './db.ts';
import {
  computeDomainBreakdown,
  computePredicate,
  gradeQuestion,
} from './grading.ts';
import {
  buildCsvTemplateString,
  buildExcelTemplateBuffer,
  buildTextTemplateString,
  convertDraftToQuestion,
  parseQuestionsDocument,
  parseStructuredText,
  type ParsedQuestionDraft,
} from './documentParser.ts';
import {
  GOOGLE_APPS_SCRIPT_CODE,
  SUPABASE_SQL_SCHEMA,
} from './templates.ts';
import type {
  AntiCheatLog,
  Assessment,
  DriveAsset,
  GasTestResult,
  Question,
  SafeQuestion,
  SessionUser,
  SiteSettings,
  StudentAnswerPayload,
  SubmissionRecord,
  UserRole,
} from '../types/cbt.ts';

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const UPLOADS_DIR = IS_SERVERLESS
  ? path.join('/tmp', 'aisa-cbt-uploads')
  : path.resolve(process.cwd(), 'public', 'uploads');

// Signed Bearer token helper (HMAC-SHA256)
// Uses SESSION_SECRET, or deterministically derives from server secret env vars so
// multi-instance serverless deployments (e.g. Vercel) validate tokens consistently.
function resolveSessionSigningKey(): string {
  const explicit = (process.env.SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  const fallbackSeed = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GAS_API_SECRET ||
    process.env.ADMIN_PASSCODE ||
    ''
  ).trim();
  if (fallbackSeed) {
    return crypto
      .createHmac('sha256', 'aisa-cbt-session-key-v1')
      .update(fallbackSeed)
      .digest('hex');
  }
  return crypto.randomBytes(32).toString('hex');
}

const SESSION_SIGNING_KEY = resolveSessionSigningKey();
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface AuthedRequest extends Request {
  authUser?: SessionUser;
}

function signSessionToken(user: SessionUser): string {
  const payload = {
    user,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SIGNING_KEY)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      user?: SessionUser;
      exp?: number;
    };
    if (!parsed.user || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.user;
  } catch {
    return null;
  }
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Sesi login diperlukan. Silakan masuk kembali.' });
  }
  const user = verifySessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
  }
  req.authUser = user;
  next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      if (!req.authUser || !roles.includes(req.authUser.role)) {
        return res.status(403).json({ error: 'Akses ditolak untuk peran akun Anda.' });
      }
      next();
    });
  };
}

export function ensureUploadsDir() {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Uploads dir init skipped:', err);
  }
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || `file_${Date.now()}`;
}

async function safeParseJson<T>(response: globalThis.Response): Promise<T | null> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isSafeHttpOrRelativeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
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
  const destPath = path.resolve(UPLOADS_DIR, safeName);
  if (!destPath.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Nama berkas tidak valid.');
  }
  try {
    fs.writeFileSync(destPath, buffer);
  } catch (err) {
    console.warn('Local upload write skipped:', err);
  }
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

  const gasCfg = await getGasConfig();
  const gasUrl = gasCfg.webappUrl;
  const gasSecret = gasCfg.secret;
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
        const json = await safeParseJson<{ ok?: boolean; file?: DriveAsset }>(gasRes);
        if (json?.ok && json.file) {
          asset = {
            ...json.file,
            driveUrl: json.file.url,
            url: IS_SERVERLESS ? json.file.url : localUrl,
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

async function normalizeMediaUrl(
  rawUrl: string | undefined,
  uploadedBy: string,
  namePrefix: string
): Promise<string | undefined> {
  if (!rawUrl) return rawUrl;
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) {
    return isSafeHttpOrRelativeUrl(trimmed) ? trimmed : undefined;
  }
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

export function createApiApp(): express.Express {
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

  app.post('/api/cache/refresh', requireRoles('admin', 'guru'), async (_req, res) => {
    invalidateDbCache();
    invalidateGasListCache();
    await loadDb({ forceFresh: true });
    res.json({ ok: true });
  });

  app.get('/api/integrations/status', requireRoles('admin'), async (_req, res) => {
    try {
      const status = await getDetailedIntegrationStatus();
      res.json({
        status,
        supabaseSql: SUPABASE_SQL_SCHEMA,
        gasCode: GOOGLE_APPS_SCRIPT_CODE,
      });
    } catch {
      res.json({
        status: getIntegrationStatus(),
        supabaseSql: SUPABASE_SQL_SCHEMA,
        gasCode: GOOGLE_APPS_SCRIPT_CODE,
      });
    }
  });

  app.put('/api/integrations/gas', requireRoles('admin'), async (req, res) => {
    try {
      const { webappUrl, folderId, secret, clearSecret, resetToEnv } = req.body as {
        webappUrl?: string;
        folderId?: string;
        secret?: string;
        clearSecret?: boolean;
        resetToEnv?: boolean;
      };

      const trimmedUrl = typeof webappUrl === 'string' ? webappUrl.trim() : undefined;
      if (trimmedUrl) {
        let validHttps = false;
        try {
          const parsed = new URL(trimmedUrl);
          validHttps = parsed.protocol === 'https:';
        } catch {
          validHttps = false;
        }
        if (!validHttps) {
          return res.status(400).json({
            error: 'URL WebApp Google Apps Script harus berupa alamat https:// yang valid (biasanya berakhiran /exec).',
          });
        }
      }

      const saved = await saveGasConfig({
        webappUrl: trimmedUrl,
        folderId: typeof folderId === 'string' ? folderId.trim() : undefined,
        secret: typeof secret === 'string' ? secret.trim() : undefined,
        clearSecret: Boolean(clearSecret),
        resetToEnv: Boolean(resetToEnv),
      });
      invalidateGasListCache();
      const status = await getDetailedIntegrationStatus();
      res.json({
        ok: true,
        status,
        savedToSupabase: saved.savedToSupabase,
        warning: saved.warning || null,
      });
    } catch (err) {
      console.error('Save GAS config error:', err);
      res.status(500).json({ error: 'Gagal menyimpan pengaturan Google Apps Script.' });
    }
  });

  app.post('/api/integrations/test-supabase', requireRoles('admin'), async (_req, res) => {
    try {
      const result = await testSupabaseConnection();
      const status = await getDetailedIntegrationStatus();
      res.json({ result, status });
    } catch {
      res.status(500).json({ error: 'Gagal menguji koneksi Supabase.' });
    }
  });

  const runGasCheck = async (override?: {
    webappUrl?: string;
    secret?: string;
  }): Promise<GasTestResult> => {
    const started = Date.now();
    const cfg = await getGasConfig({ forceFresh: true });
    const gasUrl = (override?.webappUrl !== undefined ? override.webappUrl : cfg.webappUrl).trim();
    const gasSecret = (
      override?.secret !== undefined && override.secret.trim().length > 0
        ? override.secret
        : cfg.secret
    ).trim();

    if (!gasUrl) {
      return {
        configured: false,
        reachable: false,
        latencyMs: Date.now() - started,
        webappUrl: null,
        folderId: cfg.folderId || null,
        fileCount: null,
        error: 'URL WebApp Google Apps Script belum diisi.',
      };
    }

    try {
      const url = new URL(gasUrl);
      if (url.protocol !== 'https:') {
        return {
          configured: true,
          reachable: false,
          latencyMs: Date.now() - started,
          webappUrl: gasUrl,
          folderId: cfg.folderId || null,
          fileCount: null,
          error: 'URL WebApp GAS wajib menggunakan protokol https://.',
        };
      }
      url.searchParams.set('action', 'list');
      if (gasSecret) url.searchParams.set('secret', gasSecret);
      const response = await fetch(url.toString());
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        return {
          configured: true,
          reachable: false,
          latencyMs,
          webappUrl: gasUrl,
          folderId: cfg.folderId || null,
          fileCount: null,
          error: `HTTP ${response.status} dari server Google Apps Script.`,
        };
      }

      const json = await safeParseJson<{
        ok?: boolean;
        folderId?: string;
        files?: DriveAsset[];
        error?: string;
      }>(response);

      if (!json?.ok) {
        return {
          configured: true,
          reachable: false,
          latencyMs,
          webappUrl: gasUrl,
          folderId: cfg.folderId || null,
          fileCount: null,
          error:
            json?.error === 'Unauthorized secret'
              ? 'Unauthorized secret: GAS API Secret tidak cocok dengan SHARED_SECRET di Code.gs.'
              : json?.error || 'Respons GAS bukan JSON yang valid. Pastikan WebApp di-deploy dengan akses "Anyone".',
        };
      }

      return {
        configured: true,
        reachable: true,
        latencyMs,
        webappUrl: gasUrl,
        folderId: json.folderId || cfg.folderId || null,
        fileCount: Array.isArray(json.files) ? json.files.length : 0,
        error: null,
      };
    } catch (err) {
      return {
        configured: true,
        reachable: false,
        latencyMs: Date.now() - started,
        webappUrl: gasUrl,
        folderId: cfg.folderId || null,
        fileCount: null,
        error: err instanceof Error ? err.message : 'Gagal menghubungi WebApp Google Apps Script.',
      };
    }
  };

  app.post('/api/integrations/test-gas', requireRoles('admin'), async (req, res) => {
    try {
      const body = (req.body || {}) as { webappUrl?: string; secret?: string };
      const result = await runGasCheck({
        webappUrl: typeof body.webappUrl === 'string' ? body.webappUrl : undefined,
        secret: typeof body.secret === 'string' ? body.secret : undefined,
      });
      const status = await getDetailedIntegrationStatus();
      res.json({
        result,
        status: {
          ...status,
          gasFolderId: result.folderId || status.gasFolderId,
        },
      });
    } catch {
      res.status(500).json({ error: 'Gagal menguji koneksi Google Apps Script.' });
    }
  });

  app.post('/api/integrations/test', requireRoles('admin'), async (_req, res) => {
    try {
      const [supabaseResult, gasResult] = await Promise.all([
        testSupabaseConnection(),
        runGasCheck(),
      ]);
      const status = await getDetailedIntegrationStatus();
      res.json({
        status: { ...status, gasFolderId: gasResult.folderId || status.gasFolderId },
        supabaseResult,
        gasResult,
        gasReachable: gasResult.reachable,
        gasError: gasResult.error,
      });
    } catch {
      res.status(500).json({ error: 'Gagal menguji koneksi integrasi.' });
    }
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

  app.put('/api/settings', requireRoles('admin'), async (req: AuthedRequest, res) => {
    try {
      const body = req.body as Partial<SiteSettings> & { reset?: boolean };
      if (body.reset) {
        const saved = await saveSiteSettings({ ...DEFAULT_SITE_SETTINGS });
        return res.json({ settings: saved });
      }
      const current = await getSiteSettings();
      const actorName = req.authUser?.name || 'Administrator';
      const safeLogoUrl =
        body.logoUrl !== undefined
          ? (await normalizeMediaUrl(String(body.logoUrl), actorName, 'logo')) ?? ''
          : current.logoUrl;
      const safeBgUrl =
        body.backgroundImageUrl !== undefined
          ? (await normalizeMediaUrl(String(body.backgroundImageUrl), actorName, 'bg')) ?? ''
          : current.backgroundImageUrl;
      const saved = await saveSiteSettings({
        ...current,
        appName:
          body.appName !== undefined
            ? String(body.appName).trim() || DEFAULT_SITE_SETTINGS.appName
            : current.appName,
        schoolName:
          body.schoolName !== undefined
            ? String(body.schoolName).trim() || DEFAULT_SITE_SETTINGS.schoolName
            : current.schoolName,
        tagline: body.tagline !== undefined ? String(body.tagline).trim() : current.tagline,
        eyebrowText:
          body.eyebrowText !== undefined ? String(body.eyebrowText).trim() : current.eyebrowText,
        heroTitle:
          body.heroTitle !== undefined
            ? String(body.heroTitle).trim() || DEFAULT_SITE_SETTINGS.heroTitle
            : current.heroTitle,
        heroSubtitle:
          body.heroSubtitle !== undefined ? String(body.heroSubtitle).trim() : current.heroSubtitle,
        loginHeading:
          body.loginHeading !== undefined
            ? String(body.loginHeading).trim() || DEFAULT_SITE_SETTINGS.loginHeading
            : current.loginHeading,
        logoUrl: safeLogoUrl,
        backgroundImageUrl: safeBgUrl,
        showQuickDemo: false,
        updatedAt: new Date().toISOString(),
      });
      res.json({ settings: saved });
    } catch (err) {
      console.error('Save settings error:', err);
      res.status(500).json({ error: 'Gagal menyimpan pengaturan halaman awal.' });
    }
  });

  // First-run Administrator Bootstrap (self-locking once an admin exists or ADMIN_PASSCODE is configured)
  app.get('/api/auth/bootstrap-status', async (_req, res) => {
    try {
      const hasAdmin = await hasAnyAdminAccount();
      res.json({ needsAdminSetup: !hasAdmin });
    } catch {
      res.json({ needsAdminSetup: false });
    }
  });

  app.post('/api/auth/bootstrap-admin', async (req, res) => {
    try {
      const hasAdmin = await hasAnyAdminAccount();
      if (hasAdmin) {
        return res.status(409).json({
          error: 'Akun Administrator sudah diaktifkan. Silakan masuk melalui formulir login.',
        });
      }

      const { username, name, title, password } = req.body as {
        username?: string;
        name?: string;
        title?: string;
        password?: string;
      };
      const cleanUsername = String(username || '').trim();
      const cleanName = String(name || '').trim();
      const cleanPassword = String(password || '').trim();
      const cleanTitle = String(title || 'Administrator Utama & Kepala Proktor').trim();

      if (!cleanUsername || !cleanName || cleanPassword.length < 6) {
        return res.status(400).json({
          error: 'Username, nama lengkap, dan kata sandi minimal 6 karakter wajib diisi.',
        });
      }

      const created = await upsertStaff({
        id: `adm-${Date.now()}`,
        username: cleanUsername,
        name: cleanName,
        title: cleanTitle,
        role: 'admin',
        subjectArea: 'Manajemen Madrasah',
        password: cleanPassword,
      });

      const session: SessionUser = {
        id: created.id,
        role: 'admin',
        identifier: created.username,
        name: created.name,
        title: created.title,
        subjectArea: created.subjectArea,
      };
      const token = signSessionToken(session);
      return res.json({ user: session, token });
    } catch (err) {
      console.error('Bootstrap admin error:', err);
      return res.status(500).json({ error: 'Gagal mengaktifkan akun Administrator pertama.' });
    }
  });

  // Authentication for 3 roles: student, guru, admin (auto-detect + env passcode override)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { role, identifier, secret } = req.body as {
        role?: 'student' | 'guru' | 'admin' | 'auto';
        identifier: string;
        secret: string;
      };
      const cleanId = (identifier || '').trim();
      const cleanSecret = (secret || '').trim();

      if (!cleanId || !cleanSecret) {
        return res.status(400).json({ error: 'Identitas dan kata sandi/PIN wajib diisi.' });
      }

      const envAdminPasscode = (process.env.ADMIN_PASSCODE || '').trim();
      const envAdminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();

      if (
        envAdminPasscode &&
        (!role || role === 'auto' || role === 'admin') &&
        cleanId.toLowerCase() === envAdminUsername.toLowerCase() &&
        verifyPassword(cleanSecret, envAdminPasscode)
      ) {
        const session: SessionUser = {
          id: 'adm-env',
          role: 'admin',
          identifier: envAdminUsername,
          name: 'Administrator Madrasah',
          title: 'Administrator Utama',
          subjectArea: 'Manajemen Madrasah',
        };
        return res.json({ user: session, token: signSessionToken(session) });
      }

      if (role === 'student') {
        const student = await authenticateStudent(cleanId, cleanSecret);
        if (!student) {
          return res.status(401).json({
            error: 'NISN atau PIN peserta tidak sesuai. Periksa kembali kartu peserta ujian Anda.',
          });
        }
        const session: SessionUser = {
          id: student.id,
          role: 'student',
          identifier: student.nisn,
          name: student.name,
          className: student.className,
        };
        return res.json({ user: session, token: signSessionToken(session) });
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
          return res.json({ user: session, token: signSessionToken(session) });
        }

        const staff = db.admins.find(
          (a) =>
            a.username.toLowerCase() === cleanId.toLowerCase() &&
            verifyPassword(cleanSecret, a.password)
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
          return res.json({ user: session, token: signSessionToken(session) });
        }

        return res.status(401).json({
          error: 'NISN/Username atau PIN/Kata Sandi tidak sesuai. Periksa kembali akun Anda.',
        });
      }

      if (role === 'guru' || role === 'admin') {
        const staff = db.admins.find(
          (a) =>
            a.username.toLowerCase() === cleanId.toLowerCase() &&
            verifyPassword(cleanSecret, a.password) &&
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
        return res.json({ user: session, token: signSessionToken(session) });
      }

      return res.status(400).json({ error: 'Peran login tidak dikenali.' });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Gagal memproses login.' });
    }
  });

  // Assessments listing (scoped strictly by verified session user)
  app.get('/api/assessments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const db = await loadDb();

      let assessments = db.assessments;
      if (authUser.role === 'student') {
        const studentRecord = db.students.find((s) => s.nisn === authUser.identifier);
        const studentClass = studentRecord?.className || authUser.className || '';
        const gradeMatch = studentClass.match(/Kelas\s*(\d+)/i);
        const studentGradeToken = gradeMatch ? `Kelas ${gradeMatch[1]}` : '';
        assessments = db.assessments.filter((a) => {
          if (a.status !== 'active') return false;
          if (!studentGradeToken || a.gradeLevel === 'Semua Kelas') return true;
          return a.gradeLevel.toLowerCase().includes(studentGradeToken.toLowerCase());
        });
      } else if (authUser.role === 'guru') {
        assessments = db.assessments.filter((a) => a.assignedTeacherId === authUser.id);
      }

      const enriched = assessments.map((a) => {
        const qList = db.questions.filter((q) => q.assessmentId === a.id);
        const subs = db.submissions.filter((s) => s.assessmentId === a.id);
        const mySubmission =
          authUser.role === 'student'
            ? subs.find((s) => s.studentNisn === authUser.identifier)
            : undefined;
        const { token: _t, ...safeAssessment } = a;
        return {
          ...(authUser.role === 'student' ? safeAssessment : a),
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

  app.post('/api/assessments', requireRoles('admin'), async (req, res) => {
    try {
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

  app.delete('/api/assessments/:id', requireRoles('admin'), async (req, res) => {
    try {
      await deleteAssessmentById(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete assessment error:', err);
      res.status(500).json({ error: 'Gagal menghapus asesmen.' });
    }
  });

  // Verify exam token & serve safe questions (no answer keys!)
  app.post(
    '/api/assessments/:id/verify-token',
    requireRoles('student'),
    async (req: AuthedRequest, res) => {
      try {
        const { token } = req.body as { token: string };
        const studentNisn = req.authUser!.identifier;
        const db = await loadDb();
        const assessment = db.assessments.find((a) => a.id === req.params.id);
        if (!assessment) {
          return res.status(404).json({ error: 'Asesmen tidak ditemukan.' });
        }
        if (assessment.status !== 'active') {
          return res.status(403).json({ error: 'Asesmen ini belum diaktifkan oleh proktor.' });
        }
        if (assessment.token.toUpperCase() !== (token || '').trim().toUpperCase()) {
          return res
            .status(401)
            .json({ error: 'Token sesi ujian salah. Silakan cek papan pengumuman proktor.' });
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
          options:
            assessment.shuffleQuestions && q.type === 'pg' ? shuffleArray(q.options) : q.options,
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
    }
  );

  // Structural format template downloads (zero dummy student/exam state, pure format guide)
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

  app.post(
    '/api/questions/parse-document',
    requireRoles('guru'),
    async (req: AuthedRequest, res) => {
      try {
        const actorId = req.authUser!.id;
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
              uploadedBy: req.authUser!.name,
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
          error:
            'Gagal membaca dokumen soal. Pastikan format file (.docx, .xlsx, .csv, .txt, .json) tidak rusak.',
        });
      }
    }
  );

  app.post('/api/questions/bulk', requireRoles('guru'), async (req: AuthedRequest, res) => {
    try {
      const actorId = req.authUser!.id;
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

      const authorName = req.authUser!.name || targetAsm.assignedTeacherName || 'Guru Pengampu';
      const preparedQuestions: Question[] = [];

      for (let i = 0; i < drafts.length; i++) {
        const q = convertDraftToQuestion(
          drafts[i],
          {
            assessmentId,
            authorId: actorId,
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

  app.get(
    '/api/questions/:assessmentId',
    requireRoles('admin', 'guru'),
    async (req: AuthedRequest, res) => {
      try {
        const authUser = req.authUser!;
        const db = await loadDb();
        if (authUser.role === 'guru') {
          const targetAsm = db.assessments.find((a) => a.id === req.params.assessmentId);
          if (!targetAsm || targetAsm.assignedTeacherId !== authUser.id) {
            return res.status(403).json({
              error: 'Akses ditolak: Anda hanya dapat melihat soal pada jadwal penugasan Anda sendiri.',
            });
          }
        }
        const questions = db.questions
          .filter((q) => q.assessmentId === req.params.assessmentId)
          .sort((a, b) => a.orderNumber - b.orderNumber);
        res.json({ questions });
      } catch {
        res.status(500).json({ error: 'Gagal memuat bank soal.' });
      }
    }
  );

  app.post('/api/questions', requireRoles('guru'), async (req: AuthedRequest, res) => {
    try {
      const actorId = req.authUser!.id;
      const payload = req.body as Question;
      const cleanPrompt = (payload.prompt || '').trim();
      const hasImage = Boolean(payload.imageUrl && payload.imageUrl.trim());
      if (!payload.assessmentId || (!cleanPrompt && !hasImage)) {
        return res
          .status(400)
          .json({ error: 'Asesmen dan pertanyaan atau gambar soal wajib diisi.' });
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
      const teacherName = req.authUser!.name || targetAsm.assignedTeacherName || 'Guru Pengampu';
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
        authorId: actorId,
        authorName: teacherName,
        maxPoints: Number(payload.maxPoints || 10),
        orderNumber: Number(payload.orderNumber || 1),
      });
      res.json({ question: saved });
    } catch {
      res.status(500).json({ error: 'Gagal menyimpan butir soal.' });
    }
  });

  app.delete('/api/questions/:id', requireRoles('guru'), async (req: AuthedRequest, res) => {
    try {
      const actorId = req.authUser!.id;
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
      await deleteQuestionById(String(req.params.id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Gagal menghapus soal.' });
    }
  });

  // Automated Grading & Instant Gradebook Submission
  app.post('/api/exam/submit', requireRoles('student'), async (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const {
        assessmentId,
        startedAt,
        durationSeconds,
        violationCount,
        autoSubmittedBySecurity,
        answers,
      } = req.body as {
        assessmentId: string;
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
        id: `sub-${Date.now()}-${authUser.identifier}`,
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
        studentId: authUser.id,
        studentNisn: authUser.identifier,
        studentName: authUser.name,
        className: authUser.className || '-',
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
  app.get('/api/submissions', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const db = await loadDb();
      let list = db.submissions;

      if (authUser.role === 'student') {
        list = list.filter((s) => s.studentNisn === authUser.identifier);
      } else if (authUser.role === 'guru') {
        const assignedIds = new Set(
          db.assessments
            .filter((a) => a.assignedTeacherId === authUser.id)
            .map((a) => a.id)
        );
        list = list.filter((s) => assignedIds.has(s.assessmentId));
      }
      res.json({ submissions: list });
    } catch {
      res.status(500).json({ error: 'Gagal memuat database nilai.' });
    }
  });

  app.get('/api/submissions/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const submission = await getSubmissionById(String(req.params.id));
      if (!submission) {
        return res.status(404).json({ error: 'Data nilai siswa tidak ditemukan.' });
      }

      if (authUser.role === 'student' && submission.studentNisn !== authUser.identifier) {
        return res.status(403).json({ error: 'Akses ditolak.' });
      }
      if (authUser.role === 'guru') {
        const db = await loadDb();
        const asm = db.assessments.find((a) => a.id === submission.assessmentId);
        if (!asm || asm.assignedTeacherId !== authUser.id) {
          return res.status(403).json({ error: 'Akses ditolak.' });
        }
      }

      res.json({ submission });
    } catch {
      res.status(500).json({ error: 'Gagal memuat rincian nilai.' });
    }
  });

  app.patch(
    '/api/submissions/:id/calibrate',
    requireRoles('admin', 'guru'),
    async (req: AuthedRequest, res) => {
      try {
        const authUser = req.authUser!;
        const { gradedItems, unlockSession } = req.body as {
          gradedItems?: SubmissionRecord['gradedItems'];
          unlockSession?: boolean;
        };
        const existing = await getSubmissionById(String(req.params.id));
        if (!existing) {
          return res.status(404).json({ error: 'Data nilai siswa tidak ditemukan.' });
        }

        if (authUser.role === 'guru') {
          const db = await loadDb();
          const asm = db.assessments.find((a) => a.id === existing.assessmentId);
          if (!asm || asm.assignedTeacherId !== authUser.id) {
            return res.status(403).json({ error: 'Akses ditolak.' });
          }
        }

        const nextItems = gradedItems || existing.gradedItems;
        const totalEarned =
          Math.round(nextItems.reduce((acc, i) => acc + Number(i.earnedPoints || 0), 0) * 100) /
          100;
        const totalMax =
          nextItems.reduce((acc, i) => acc + Number(i.maxPoints || 0), 0) ||
          existing.totalPointsMax;
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
      } catch {
        res.status(500).json({ error: 'Gagal memperbarui nilai.' });
      }
    }
  );

  // Anti-cheat violation logging
  app.post('/api/anti-cheat/log', requireRoles('student'), async (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const payload = req.body as Omit<AntiCheatLog, 'id' | 'timestamp'>;
      const log: AntiCheatLog = {
        ...payload,
        studentId: authUser.id,
        studentNisn: authUser.identifier,
        studentName: authUser.name,
        className: authUser.className || '-',
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      };
      await appendAntiCheatLog(log);
      res.json({ log });
    } catch {
      res.status(500).json({ error: 'Gagal mencatat log keamanan.' });
    }
  });

  app.get('/api/anti-cheat/logs', requireRoles('admin', 'guru'), async (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const db = await loadDb();
      let logs = db.antiCheatLogs;
      if (authUser.role === 'guru') {
        const assignedIds = new Set(
          db.assessments
            .filter((a) => a.assignedTeacherId === authUser.id)
            .map((a) => a.id)
        );
        logs = logs.filter((l) => assignedIds.has(l.assessmentId));
      }
      res.json({ logs });
    } catch {
      res.status(500).json({ error: 'Gagal memuat log pengawas.' });
    }
  });

  // Role & User Account Management (Admin only)
  app.get('/api/users', requireRoles('admin'), async (_req, res) => {
    try {
      const db = await loadDb({ forceFresh: true });
      res.json({
        students: db.students,
        staff: db.admins.map(({ password: _p, ...rest }) => rest),
      });
    } catch {
      res.status(500).json({ error: 'Gagal memuat daftar akun.' });
    }
  });

  app.post('/api/users/student', requireRoles('admin'), async (req, res) => {
    try {
      const { id, nisn, name, className, pin } = req.body;
      if (!nisn || !name || !className || !pin) {
        return res.status(400).json({ error: 'NISN, nama lengkap, kelas, dan PIN wajib diisi.' });
      }
      const result = await addStudent({
        id: id || `stu-${Date.now()}`,
        nisn: String(nisn).trim(),
        name: String(name).trim(),
        className: String(className).trim(),
        pin: String(pin).trim(),
      });
      res.json(result);
    } catch (err) {
      console.error('Save student error:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan akun peserta ujian.',
      });
    }
  });

  app.delete('/api/users/student/:id', requireRoles('admin'), async (req, res) => {
    try {
      await deleteStudentById(String(req.params.id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Gagal menghapus akun peserta.' });
    }
  });

  app.post('/api/users/staff', requireRoles('admin'), async (req, res) => {
    try {
      const { id, username, name, title, role, subjectArea, password } = req.body;
      if (!username || !name || !role) {
        return res.status(400).json({ error: 'Username, nama lengkap, dan peran wajib diisi.' });
      }
      const cleanPassword = String(password || '').trim();
      const db = await loadDb();
      const existing = id ? db.admins.find((a) => a.id === id) : undefined;
      if (!existing && !cleanPassword) {
        return res.status(400).json({ error: 'Kata sandi wajib diisi untuk akun baru.' });
      }
      const saved = await upsertStaff({
        id: id || `${role}-${Date.now()}`,
        username: String(username).trim(),
        name: String(name).trim(),
        title: String(title || (role === 'admin' ? 'Administrator CBT' : 'Guru Pengampu')).trim(),
        role: role === 'admin' ? 'admin' : 'guru',
        subjectArea: subjectArea ? String(subjectArea).trim() : undefined,
        password: cleanPassword || existing!.password,
      });
      const { password: _p, ...safeStaff } = saved;
      res.json({ staff: safeStaff });
    } catch {
      res.status(500).json({ error: 'Gagal menyimpan akun guru/admin.' });
    }
  });

  app.delete('/api/users/staff/:id', requireRoles('admin'), async (req: AuthedRequest, res) => {
    try {
      if (req.params.id === req.authUser?.id) {
        return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
      }
      await deleteStaffById(String(req.params.id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Gagal menghapus akun staf.' });
    }
  });

  // Google Drive via Google Apps Script Proxy + Local Madrasah Media Gallery
  app.get('/api/drive/files', requireRoles('admin', 'guru'), async (req, res) => {
    try {
      const db = await loadDb();
      const gasCfg = await getGasConfig();
      const gasUrl = gasCfg.webappUrl;
      const gasSecret = gasCfg.secret;
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
            const json = await safeParseJson<{ ok?: boolean; files?: DriveAsset[] }>(response);
            if (json?.ok && Array.isArray(json.files)) {
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
    } catch {
      res.status(500).json({ error: 'Gagal memuat file media Google Drive.' });
    }
  });

  app.post('/api/drive/upload', requireRoles('admin', 'guru'), async (req: AuthedRequest, res) => {
    try {
      const { fileName, mimeType, base64Data } = req.body as {
        fileName: string;
        mimeType: string;
        base64Data: string;
      };

      if (!fileName || !mimeType || !base64Data) {
        return res.status(400).json({ error: 'File tidak lengkap untuk diunggah.' });
      }

      const { asset, gasSynced, gasConfigured } = await uploadMediaToDriveAndLocal({
        fileName,
        mimeType,
        base64Data,
        uploadedBy: req.authUser!.name || 'Guru/Admin',
      });

      res.json({ asset, gasSynced, gasConfigured });
    } catch (err) {
      console.error('Upload media error:', err);
      res.status(500).json({ error: 'Gagal mengunggah media.' });
    }
  });

  app.post('/api/drive/sync-all', requireRoles('admin', 'guru'), async (_req, res) => {
    try {
      const gasCfg = await getGasConfig();
      const gasUrl = gasCfg.webappUrl;
      const gasSecret = gasCfg.secret;
      if (!gasUrl) {
        return res.status(400).json({
          error: 'URL WebApp Google Apps Script belum disetel di pengaturan Admin atau Secrets.',
        });
      }

      const db = await loadDb();
      const pending = db.driveAssets.filter(
        (a) => a.source === 'local_madrasah' && a.url.startsWith('/uploads/')
      );
      let syncedCount = 0;

      for (const item of pending) {
        const relPath = item.url.replace(/^\/uploads\//, '');
        const absPath = path.resolve(UPLOADS_DIR, relPath);
        if (!absPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(absPath)) continue;
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
          const json = await safeParseJson<{ ok?: boolean; file?: DriveAsset }>(gasRes);
          if (json?.ok && json.file) {
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

      invalidateGasListCache();
      res.json({ ok: true, syncedCount });
    } catch (err) {
      console.error('Sync all drive error:', err);
      res.status(500).json({ error: 'Gagal menyinkronkan media ke Google Drive.' });
    }
  });

  app.post(
    '/api/drive/backup-scores',
    requireRoles('admin', 'guru'),
    async (req: AuthedRequest, res) => {
      try {
        const { assessmentId } = req.body as { assessmentId?: string };
        const authUser = req.authUser!;
        const db = await loadDb();
        let scopedSubmissions = db.submissions;
        if (authUser.role === 'guru') {
          const assignedIds = new Set(
            db.assessments
              .filter((a) => a.assignedTeacherId === authUser.id)
              .map((a) => a.id)
          );
          scopedSubmissions = scopedSubmissions.filter((s) => assignedIds.has(s.assessmentId));
        }
        const targetSubs =
          assessmentId && assessmentId !== 'all'
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

        const gasCfg = await getGasConfig();
        const gasUrl = gasCfg.webappUrl;
        const gasSecret = gasCfg.secret;
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
              const parsed = await safeParseJson<{
                ok: boolean;
                driveFileId?: string;
                url?: string;
              }>(gasRes);
              if (parsed) driveResult = parsed;
            }
          } catch (gasErr) {
            console.warn('GAS score backup fallback:', gasErr);
          }
        }

        ensureUploadsDir();
        const backupFileName = `${Date.now()}_${sanitizeFilename(fileName)}`;
        try {
          fs.writeFileSync(path.join(UPLOADS_DIR, backupFileName), csvContent, 'utf-8');
        } catch (err) {
          console.warn('Local backup CSV write skipped:', err);
        }

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
          downloadUrl: driveResult.url || `/uploads/${backupFileName}`,
        });
      } catch (err) {
        console.error('Backup scores error:', err);
        res.status(500).json({ error: 'Gagal mencadangkan nilai ke Google Drive.' });
      }
    }
  );

  app.delete('/api/drive/files/:id', requireRoles('admin', 'guru'), async (req, res) => {
    try {
      const db = await loadDb();
      const target = db.driveAssets.find((d) => d.id === req.params.id);
      const gasCfg = await getGasConfig();
      const gasUrl = gasCfg.webappUrl;
      const gasSecret = gasCfg.secret;

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

      await removeDriveAsset(String(req.params.id));
      invalidateGasListCache();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Gagal menghapus file.' });
    }
  });

  return app;
}
