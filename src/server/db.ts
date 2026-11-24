import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminAccount,
  AntiCheatLog,
  Assessment,
  DriveAsset,
  IntegrationStatus,
  Question,
  SiteSettings,
  StudentAccount,
  SubmissionRecord,
  SupabaseTableCheck,
  SupabaseTestResult,
} from '../types/cbt.ts';

export interface GasConfig {
  webappUrl: string;
  folderId: string;
  secret: string;
}

export interface DatabaseSchema {
  assessments: Assessment[];
  questions: Question[];
  students: StudentAccount[];
  admins: AdminAccount[];
  submissions: SubmissionRecord[];
  antiCheatLogs: AntiCheatLog[];
  driveAssets: DriveAsset[];
  siteSettings: SiteSettings;
  gasConfig?: GasConfig;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  appName: 'AISA',
  schoolName: "MI Ma'arif Al Ihsan Soborejo",
  tagline: 'Al Ihsan Smart Asesment · Tahun Pelajaran 2026/2027',
  eyebrowText: 'Al Ihsan Smart Asesment · Literasi & Numerasi',
  heroTitle: 'Ujian Madrasah yang Jujur, Terukur, dan Terintegrasi',
  heroSubtitle:
    'Platform evaluasi digital AISA untuk Asesmen Sumatif Akhir Semester, Asesmen Tengah Semester, serta Try Out Literasi dan Numerasi dengan dukungan lampiran gambar, video, keamanan anti-kecurangan, dan database nilai instan.',
  loginHeading: 'Masuk ke Al Ihsan Smart Asesment',
  logoUrl: '/src/assets/images/aisa_madrasah_logo_1795493183530.jpg',
  backgroundImageUrl: '/src/assets/images/madrasah_campus_hero_1794802017792.jpg',
  showQuickDemo: false,
  updatedAt: '2026-11-23T00:00:00.000Z',
};

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const BUNDLED_DB_FILE = path.resolve(process.cwd(), 'data', 'cbt_database.json');
const DATA_DIR = IS_SERVERLESS
  ? path.join('/tmp', 'aisa-cbt-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cbt_database.json');

// =========================================================================
// PASSWORD HASHING (scrypt + constant-time verification)
// =========================================================================
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(plain, salt, 64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }
  const a = crypto.createHash('sha256').update(plain).digest();
  const b = crypto.createHash('sha256').update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createDefaultAdmin(): AdminAccount {
  return {
    id: 'adm-default',
    username: 'admin',
    name: 'Administrator Madrasah',
    title: 'Administrator Utama & Kepala Proktor',
    role: 'admin',
    subjectArea: 'Manajemen Madrasah',
    password: hashPassword('admin'),
  };
}

function createEmptyStore(): DatabaseSchema {
  return {
    admins: [createDefaultAdmin()],
    students: [],
    assessments: [],
    questions: [],
    submissions: [],
    antiCheatLogs: [],
    driveAssets: [],
    siteSettings: { ...DEFAULT_SITE_SETTINGS },
  };
}

function saveLocalStore(data: DatabaseSchema) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.warn('Local store write skipped:', err);
  }
}

function ensureLocalStore(): DatabaseSchema {
  let raw = '';
  if (fs.existsSync(DB_FILE)) {
    raw = fs.readFileSync(DB_FILE, 'utf-8');
  } else if (IS_SERVERLESS && fs.existsSync(BUNDLED_DB_FILE)) {
    raw = fs.readFileSync(BUNDLED_DB_FILE, 'utf-8');
  } else {
    const empty = createEmptyStore();
    saveLocalStore(empty);
    return empty;
  }

  let parsed: Partial<DatabaseSchema> = {};
  try {
    parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
  } catch {
    const empty = createEmptyStore();
    saveLocalStore(empty);
    return empty;
  }

  const normalized: DatabaseSchema = {
    admins: Array.isArray(parsed.admins) ? parsed.admins : [],
    students: Array.isArray(parsed.students) ? parsed.students : [],
    assessments: Array.isArray(parsed.assessments) ? parsed.assessments : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
    antiCheatLogs: Array.isArray(parsed.antiCheatLogs) ? parsed.antiCheatLogs : [],
    driveAssets: Array.isArray(parsed.driveAssets) ? parsed.driveAssets : [],
    siteSettings: parsed.siteSettings
      ? { ...DEFAULT_SITE_SETTINGS, ...parsed.siteSettings, showQuickDemo: false }
      : { ...DEFAULT_SITE_SETTINGS },
    gasConfig: parsed.gasConfig
      ? {
          webappUrl: String(parsed.gasConfig.webappUrl || '').trim(),
          folderId: String(parsed.gasConfig.folderId || '').trim(),
          secret: String(parsed.gasConfig.secret || '').trim(),
        }
      : undefined,
  };
  if (!normalized.admins.some((a) => a.role === 'admin')) {
    normalized.admins.unshift(createDefaultAdmin());
    saveLocalStore(normalized);
  } else if (!fs.existsSync(DB_FILE)) {
    saveLocalStore(normalized);
  }
  return normalized;
}

// =========================================================================
// SUPABASE EGRESS-SAVING CACHE & TARGETED QUERY LAYER
// =========================================================================
const DB_CACHE_TTL_MS = Number(process.env.DB_CACHE_TTL_MS || 5 * 60 * 1000); // 5 minutes
const SETTINGS_CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS || 10 * 60 * 1000); // 10 minutes

const ASSESSMENT_COLUMNS =
  'id,title,category,subject,grade_level,semester,academic_year,token,duration_minutes,max_violations,shuffle_questions,show_instant_result,status,assigned_teacher_id,assigned_teacher_name,scheduled_date,schedule_window,created_at';
const QUESTION_COLUMNS =
  'id,assessment_id,order_number,type,domain,cognitive_level,stimulus_title,stimulus_passage,image_url,image_caption,video_url,video_caption,prompt,options,correct_option_id,correct_option_ids,essay_keywords,essay_sample_answer,max_points,author_id,author_name';
const SUBMISSION_SUMMARY_COLUMNS =
  'id,assessment_id,assessment_title,student_id,student_nisn,student_name,class_name,started_at,submitted_at,duration_seconds,violation_count,auto_submitted_by_security,is_locked,total_points_earned,total_points_max,final_score,predicate,domain_breakdown,synced_to_supabase,backed_up_to_drive';
const SUBMISSION_DETAIL_COLUMNS = `${SUBMISSION_SUMMARY_COLUMNS},graded_items`;
const ANTI_CHEAT_COLUMNS =
  'id,assessment_id,assessment_title,student_id,student_nisn,student_name,class_name,event_type,detail,violation_number,timestamp';
const STUDENT_COLUMNS = 'id,nisn,name,class_name,pin';
const ADMIN_COLUMNS = 'id,username,name,title,role,subject_area,password';
const DRIVE_ASSET_COLUMNS =
  'id,name,mime_type,media_kind,size_bytes,url,drive_file_id,source,uploaded_by,created_at';
const SITE_SETTINGS_COLUMNS =
  'id,app_name,school_name,tagline,eyebrow_text,hero_title,hero_subtitle,login_heading,logo_url,background_image_url,show_quick_demo,updated_at';

const EXPECTED_SUPABASE_TABLES = [
  'assessments',
  'questions',
  'students',
  'submissions',
  'anti_cheat_logs',
  'drive_assets',
  'admins',
  'site_settings',
] as const;

let supabaseClient: SupabaseClient | null = null;
function getSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
}

function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();
}

export function getSupabase(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return supabaseClient;
}

let cachedDb: DatabaseSchema | null = null;
let cachedDbAt = 0;
let inFlightDbLoad: Promise<DatabaseSchema> | null = null;

let cachedSettings: SiteSettings | null = null;
let cachedSettingsAt = 0;
let inFlightSettingsLoad: Promise<SiteSettings> | null = null;

// Track submission IDs whose full `graded_items` JSONB was already hydrated in RAM
const hydratedSubmissionDetails = new Map<string, SubmissionRecord['gradedItems']>();

let cachedGasConfig: GasConfig | null = null;
let cachedGasConfigAt = 0;

export function invalidateDbCache() {
  cachedDb = null;
  cachedDbAt = 0;
  cachedSettings = null;
  cachedSettingsAt = 0;
  cachedGasConfig = null;
  cachedGasConfigAt = 0;
  hydratedSubmissionDetails.clear();
}

export interface ResolvedGasConfig {
  webappUrl: string;
  folderId: string;
  secret: string;
  source: 'admin_panel' | 'env' | 'none';
  secretConfigured: boolean;
}

export async function getGasConfig(options?: { forceFresh?: boolean }): Promise<ResolvedGasConfig> {
  const envUrl = (process.env.GAS_DRIVE_WEBAPP_URL || '').trim();
  const envFolder = (process.env.GAS_DRIVE_FOLDER_ID || '').trim();
  const envSecret = (process.env.GAS_API_SECRET || '').trim();

  let stored: GasConfig | null =
    !options?.forceFresh && cachedGasConfig && isCacheFresh(cachedGasConfigAt, SETTINGS_CACHE_TTL_MS)
      ? cachedGasConfig
      : null;

  if (!stored) {
    const local = ensureLocalStore();
    stored = local.gasConfig || null;

    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('site_settings')
          .select('gas_webapp_url,gas_folder_id,gas_api_secret')
          .eq('id', 'default')
          .maybeSingle();
        if (!error && data) {
          stored = {
            webappUrl: String(data.gas_webapp_url || '').trim(),
            folderId: String(data.gas_folder_id || '').trim(),
            secret: String(data.gas_api_secret || '').trim(),
          };
        }
      } catch {
        // Fallback to local store if gas_* columns aren't migrated yet
      }
    }

    cachedGasConfig = stored || { webappUrl: '', folderId: '', secret: '' };
    cachedGasConfigAt = Date.now();
  }

  const hasPanelUrl = Boolean(stored?.webappUrl);
  const hasPanelFolder = Boolean(stored?.folderId);
  const hasPanelSecret = Boolean(stored?.secret);

  const webappUrl = stored?.webappUrl || envUrl;
  const folderId = stored?.folderId || envFolder;
  const secret = stored?.secret || envSecret;

  const source: ResolvedGasConfig['source'] =
    hasPanelUrl || hasPanelFolder || hasPanelSecret
      ? 'admin_panel'
      : webappUrl || folderId || secret
        ? 'env'
        : 'none';

  return {
    webappUrl,
    folderId,
    secret,
    source,
    secretConfigured: Boolean(secret),
  };
}

export async function saveGasConfig(params: {
  webappUrl?: string;
  folderId?: string;
  secret?: string;
  clearSecret?: boolean;
  resetToEnv?: boolean;
}): Promise<{ config: ResolvedGasConfig; savedToSupabase: boolean; warning?: string }> {
  const local = ensureLocalStore();
  const currentResolved = await getGasConfig({ forceFresh: true });
  const prevStored = local.gasConfig || { webappUrl: '', folderId: '', secret: '' };

  let nextStored: GasConfig;
  if (params.resetToEnv) {
    nextStored = { webappUrl: '', folderId: '', secret: '' };
  } else {
    const nextUrl =
      params.webappUrl !== undefined ? params.webappUrl.trim() : prevStored.webappUrl;
    const nextFolder =
      params.folderId !== undefined ? params.folderId.trim() : prevStored.folderId;
    let nextSecret = prevStored.secret || currentResolved.secret;
    if (params.clearSecret) {
      nextSecret = '';
    } else if (params.secret !== undefined && params.secret.trim().length > 0) {
      nextSecret = params.secret.trim();
    } else if (!prevStored.secret) {
      nextSecret = '';
    }
    nextStored = {
      webappUrl: nextUrl,
      folderId: nextFolder,
      secret: nextSecret,
    };
  }

  local.gasConfig = nextStored;
  saveLocalStore(local);
  cachedGasConfig = nextStored;
  cachedGasConfigAt = Date.now();

  let savedToSupabase = false;
  let warning: string | undefined;
  const sb = getSupabase();
  if (sb) {
    try {
      const settings = await getSiteSettings();
      const { error } = await sb.from('site_settings').upsert({
        id: 'default',
        app_name: settings.appName,
        school_name: settings.schoolName,
        tagline: settings.tagline,
        eyebrow_text: settings.eyebrowText,
        hero_title: settings.heroTitle,
        hero_subtitle: settings.heroSubtitle,
        login_heading: settings.loginHeading,
        logo_url: settings.logoUrl,
        background_image_url: settings.backgroundImageUrl,
        show_quick_demo: false,
        gas_webapp_url: nextStored.webappUrl,
        gas_folder_id: nextStored.folderId,
        gas_api_secret: nextStored.secret,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        warning = `Pengaturan GAS tersimpan sementara di server lokal, namun Supabase mengembalikan error: ${error.message}. Pastikan Skema SQL terbaru sudah dijalankan di Supabase SQL Editor.`;
      } else {
        savedToSupabase = true;
      }
    } catch (err) {
      warning =
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan konfigurasi GAS ke tabel site_settings Supabase.';
    }
  }

  const resolved = await getGasConfig({ forceFresh: true });
  return { config: resolved, savedToSupabase, warning };
}

export function getIntegrationStatus(): IntegrationStatus {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseSecretKey();
  const supabasePublishable = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const supabaseJwksUrl = (process.env.SUPABASE_JWKS_URL || '').trim();
  const gasUrl = (cachedGasConfig?.webappUrl || process.env.GAS_DRIVE_WEBAPP_URL || '').trim();
  const gasFolder = (cachedGasConfig?.folderId || process.env.GAS_DRIVE_FOLDER_ID || '').trim();
  const gasSecret = (cachedGasConfig?.secret || process.env.GAS_API_SECRET || '').trim();

  let host: string | null = null;
  if (supabaseUrl) {
    try {
      host = new URL(supabaseUrl).hostname;
    } catch {
      host = supabaseUrl;
    }
  }

  const supabaseUrlConfigured = Boolean(supabaseUrl);
  const supabaseSecretConfigured = Boolean(supabaseKey);
  const supabaseConfigured = supabaseUrlConfigured && supabaseSecretConfigured;
  return {
    supabaseConfigured,
    supabaseUrlConfigured,
    supabaseSecretConfigured,
    supabaseProjectHost: host,
    supabasePublishableConfigured: Boolean(supabasePublishable),
    supabaseJwksUrl: supabaseJwksUrl || null,
    supabaseTablesReady: false,
    supabaseMissingTables: [],
    gasDriveConfigured: Boolean(gasUrl),
    gasDriveWebappUrl: gasUrl || null,
    gasFolderId: gasFolder || null,
    gasSecretConfigured: Boolean(gasSecret),
    gasConfigSource:
      cachedGasConfig?.webappUrl || cachedGasConfig?.folderId || cachedGasConfig?.secret
        ? 'admin_panel'
        : gasUrl || gasFolder || gasSecret
          ? 'env'
          : 'none',
    storageMode: supabaseConfigured ? 'supabase' : 'local_persistent',
    runtimePlatform: process.env.VERCEL ? 'vercel' : 'node',
  };
}

export async function testSupabaseConnection(): Promise<SupabaseTestResult> {
  const started = Date.now();
  const base = getIntegrationStatus();
  const sb = getSupabase();
  const rawKey = getSupabaseSecretKey();

  if (!sb) {
    const missingVars: string[] = [];
    if (!base.supabaseUrlConfigured) missingVars.push('SUPABASE_URL');
    if (!base.supabaseSecretConfigured) {
      missingVars.push('SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY');
    }
    const targetHint =
      base.runtimePlatform === 'vercel'
        ? 'Tambahkan di Vercel Project Settings -> Environment Variables, lalu klik Redeploy.'
        : 'Atur di panel Secrets (AI Studio) atau Environment Variables server hosting (seperti Vercel -> Redeploy).';

    return {
      configured: false,
      connected: false,
      tablesReady: false,
      latencyMs: Date.now() - started,
      projectHost: base.supabaseProjectHost,
      tables: [],
      error: `Variabel server belum terbaca: ${missingVars.join(' dan ')}. ${targetHint}`,
    };
  }

  const tables: SupabaseTableCheck[] = await Promise.all(
    EXPECTED_SUPABASE_TABLES.map(async (table) => {
      try {
        const { count, error } = await sb
          .from(table)
          .select('*', { count: 'exact' })
          .limit(1);
        if (error) {
          return {
            table,
            ok: false,
            rowCount: null,
            error: error.message || `Gagal mengakses tabel ${table}`,
          };
        }
        return {
          table,
          ok: true,
          rowCount: typeof count === 'number' ? count : 0,
        };
      } catch (err) {
        return {
          table,
          ok: false,
          rowCount: null,
          error: err instanceof Error ? err.message : 'Gagal mengakses tabel.',
        };
      }
    })
  );

  const latencyMs = Date.now() - started;
  const anyOk = tables.some((t) => t.ok);
  const failed = tables.filter((t) => !t.ok);
  const firstErr = failed[0]?.error || null;
  const hasPermissionError = failed.some((t) =>
    /permission denied|row-level security|not allowed|insufficient_privilege/i.test(t.error || '')
  );
  const missingOnly = failed.filter((t) =>
    /could not find the table|relation .* does not exist|schema cache/i.test(t.error || '')
  );
  const isWrongKeyPrefix = rawKey.startsWith('sb_publishable_');
  const isAuthOrNetworkError =
    !anyOk &&
    Boolean(
      firstErr &&
        /invalid api key|jwt|unauthorized|fetch failed|enotfound|econnrefused/i.test(firstErr)
    );

  let errorSummary: string | null = null;
  if (isWrongKeyPrefix) {
    errorSummary =
      'Kunci Supabase yang terpasang adalah Publishable Key (sb_publishable_...). Server membutuhkan SUPABASE_SECRET_KEY (sb_secret_...) atau SUPABASE_SERVICE_ROLE_KEY.';
  } else if (isAuthOrNetworkError) {
    errorSummary = firstErr;
  } else if (hasPermissionError) {
    errorSummary = `Koneksi ke host Supabase berhasil, namun akses ditolak (permission denied). Jalankan ulang Skema SQL terbaru (termasuk perintah GRANT service_role) di Supabase Dashboard -> SQL Editor, lalu periksa SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.`;
  } else if (failed.length > 0) {
    const names = (missingOnly.length > 0 ? missingOnly : failed).map((m) => m.table).join(', ');
    errorSummary = `${failed.length} tabel bermasalah/belum tersedia (${names}). Jalankan Skema SQL di Supabase SQL Editor.`;
  }

  return {
    configured: true,
    connected: !isAuthOrNetworkError,
    tablesReady: failed.length === 0,
    latencyMs,
    projectHost: base.supabaseProjectHost,
    tables,
    error: errorSummary,
  };
}

export async function getDetailedIntegrationStatus(): Promise<IntegrationStatus> {
  const gasCfg = await getGasConfig({ forceFresh: true });
  const base = getIntegrationStatus();
  const baseWithGas: IntegrationStatus = {
    ...base,
    gasDriveConfigured: Boolean(gasCfg.webappUrl),
    gasDriveWebappUrl: gasCfg.webappUrl || null,
    gasFolderId: gasCfg.folderId || null,
    gasSecretConfigured: gasCfg.secretConfigured,
    gasConfigSource: gasCfg.source,
  };

  const sb = getSupabase();
  if (!sb) {
    return baseWithGas;
  }

  const missingTables: string[] = [];
  await Promise.all(
    EXPECTED_SUPABASE_TABLES.map(async (table) => {
      try {
        const { error } = await sb.from(table).select('*').limit(1);
        if (error) {
          missingTables.push(table);
        }
      } catch {
        missingTables.push(table);
      }
    })
  );

  return {
    ...baseWithGas,
    supabaseTablesReady: missingTables.length === 0,
    supabaseMissingTables: missingTables.sort(),
  };
}

// Helper to map Supabase snake_case rows back to camelCase
function mapAssessmentFromDb(row: Record<string, any>): Assessment {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    subject: row.subject,
    gradeLevel: row.grade_level,
    semester: row.semester,
    academicYear: row.academic_year,
    token: row.token,
    durationMinutes: row.duration_minutes,
    maxViolations: row.max_violations,
    shuffleQuestions: row.shuffle_questions,
    showInstantResult: row.show_instant_result,
    status: row.status,
    assignedTeacherId: row.assigned_teacher_id || undefined,
    assignedTeacherName: row.assigned_teacher_name || undefined,
    scheduledDate: row.scheduled_date || undefined,
    scheduleWindow: row.schedule_window || undefined,
    createdAt: row.created_at,
  };
}

function mapAssessmentToDb(a: Assessment) {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    subject: a.subject,
    grade_level: a.gradeLevel,
    semester: a.semester,
    academic_year: a.academicYear,
    token: a.token,
    duration_minutes: a.durationMinutes,
    max_violations: a.maxViolations,
    shuffle_questions: a.shuffleQuestions,
    show_instant_result: a.showInstantResult,
    status: a.status,
    assigned_teacher_id: a.assignedTeacherId || null,
    assigned_teacher_name: a.assignedTeacherName || null,
    scheduled_date: a.scheduledDate || null,
    schedule_window: a.scheduleWindow || null,
    created_at: a.createdAt,
  };
}

function mapQuestionFromDb(row: Record<string, any>): Question {
  const rawOptions: Question['options'] = Array.isArray(row.options) ? row.options : [];
  const metaTypeOpt = rawOptions.find((o) => o?.id === '__meta_type__');
  const legacyActualType =
    (metaTypeOpt?.text as Question['type'] | undefined) ||
    (rawOptions.find((o: any) => typeof o?.actualType === 'string') as any)?.actualType;
  const resolvedType: Question['type'] =
    legacyActualType === 'pgk_kategori' || legacyActualType === 'isian'
      ? legacyActualType
      : row.type;
  const options = rawOptions.filter((o) => o?.id !== '__meta_type__');
  const inferredPair = options.find((o) => Array.isArray(o?.categoryPair) && o.categoryPair.length === 2)?.categoryPair;
  const rawLabels = Array.isArray(row.category_labels) && row.category_labels.length === 2
    ? (row.category_labels as [string, string])
    : inferredPair;
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    orderNumber: row.order_number,
    type: resolvedType,
    domain: row.domain,
    cognitiveLevel: row.cognitive_level,
    stimulusTitle: row.stimulus_title || undefined,
    stimulusPassage: row.stimulus_passage || undefined,
    imageUrl: row.image_url || undefined,
    imageCaption: row.image_caption || undefined,
    videoUrl: row.video_url || undefined,
    videoCaption: row.video_caption || undefined,
    prompt: row.prompt,
    options,
    categoryLabels:
      resolvedType === 'pgk_kategori'
        ? rawLabels || ['Sesuai', 'Tidak Sesuai']
        : undefined,
    correctOptionId: row.correct_option_id || undefined,
    correctOptionIds: row.correct_option_ids || [],
    essayKeywords: row.essay_keywords || [],
    essaySampleAnswer: row.essay_sample_answer || undefined,
    maxPoints: Number(row.max_points || 10),
    authorId: row.author_id || undefined,
    authorName: row.author_name || undefined,
  };
}

function mapQuestionToDb(q: Question, legacySafe = false) {
  let serializedOptions: any[] = (q.options || []).map((opt, idx) => {
    if (q.type === 'pgk_kategori' && idx === 0) {
      return {
        ...opt,
        categoryPair: q.categoryLabels || opt.categoryPair || ['Sesuai', 'Tidak Sesuai'],
        ...(legacySafe ? { actualType: 'pgk_kategori' } : {}),
      };
    }
    return opt;
  });

  let dbType: string = q.type;
  if (legacySafe) {
    if (q.type === 'pgk_kategori') {
      dbType = 'pgk';
      if (serializedOptions.length === 0) {
        serializedOptions = [
          {
            id: '__meta_type__',
            label: '__TYPE__',
            text: 'pgk_kategori',
            categoryPair: q.categoryLabels || ['Sesuai', 'Tidak Sesuai'],
          },
        ];
      }
    } else if (q.type === 'isian') {
      dbType = 'essay';
      serializedOptions = [{ id: '__meta_type__', label: '__TYPE__', text: 'isian' }];
    }
  }

  return {
    id: q.id,
    assessment_id: q.assessmentId,
    order_number: q.orderNumber,
    type: dbType,
    domain: q.domain,
    cognitive_level: q.cognitiveLevel,
    stimulus_title: q.stimulusTitle || null,
    stimulus_passage: q.stimulusPassage || null,
    image_url: q.imageUrl || null,
    image_caption: q.imageCaption || null,
    video_url: q.videoUrl || null,
    video_caption: q.videoCaption || null,
    prompt: q.prompt,
    options: serializedOptions,
    correct_option_id: q.correctOptionId || null,
    correct_option_ids: q.correctOptionIds || [],
    essay_keywords: q.essayKeywords || [],
    essay_sample_answer: q.essaySampleAnswer || null,
    max_points: q.maxPoints,
    author_id: q.authorId || null,
    author_name: q.authorName || null,
  };
}

function mapSubmissionFromDb(row: Record<string, any>): SubmissionRecord {
  const cachedItems = hydratedSubmissionDetails.get(row.id);
  const gradedItems = Array.isArray(row.graded_items)
    ? row.graded_items
    : cachedItems || [];
  if (Array.isArray(row.graded_items) && row.graded_items.length > 0) {
    hydratedSubmissionDetails.set(row.id, row.graded_items);
  }
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    assessmentTitle: row.assessment_title,
    studentId: row.student_id,
    studentNisn: row.student_nisn,
    studentName: row.student_name,
    className: row.class_name,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    durationSeconds: row.duration_seconds,
    violationCount: row.violation_count,
    autoSubmittedBySecurity: row.auto_submitted_by_security,
    isLocked: row.is_locked,
    totalPointsEarned: Number(row.total_points_earned),
    totalPointsMax: Number(row.total_points_max),
    finalScore: Number(row.final_score),
    predicate: row.predicate,
    domainBreakdown: row.domain_breakdown || [],
    gradedItems,
    syncedToSupabase: true,
    backedUpToDrive: Boolean(row.backed_up_to_drive),
  };
}

function mapSubmissionToDb(s: SubmissionRecord) {
  return {
    id: s.id,
    assessment_id: s.assessmentId,
    assessment_title: s.assessmentTitle,
    student_id: s.studentId,
    student_nisn: s.studentNisn,
    student_name: s.studentName,
    class_name: s.className,
    started_at: s.startedAt,
    submitted_at: s.submittedAt,
    duration_seconds: s.durationSeconds,
    violation_count: s.violationCount,
    auto_submitted_by_security: s.autoSubmittedBySecurity,
    is_locked: s.isLocked,
    total_points_earned: s.totalPointsEarned,
    total_points_max: s.totalPointsMax,
    final_score: s.finalScore,
    predicate: s.predicate,
    domain_breakdown: s.domainBreakdown,
    graded_items: s.gradedItems,
    synced_to_supabase: true,
    backed_up_to_drive: s.backedUpToDrive,
  };
}

function mapAdminFromDb(row: Record<string, any>): AdminAccount {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    title: row.title,
    role: row.role === 'admin' ? 'admin' : 'guru',
    subjectArea: row.subject_area || undefined,
    password: row.password,
  };
}

function mapAdminToDb(a: AdminAccount) {
  return {
    id: a.id,
    username: a.username,
    name: a.name,
    title: a.title,
    role: a.role,
    subject_area: a.subjectArea || null,
    password: a.password,
  };
}

function isCacheFresh(ts: number, ttl: number): boolean {
  return ts > 0 && Date.now() - ts < ttl;
}

export async function loadDb(options?: { forceFresh?: boolean }): Promise<DatabaseSchema> {
  const forceFresh = Boolean(options?.forceFresh);
  const local = ensureLocalStore();
  const sb = getSupabase();

  if (!sb) {
    cachedDb = local;
    cachedDbAt = Date.now();
    return local;
  }

  if (!forceFresh && cachedDb && isCacheFresh(cachedDbAt, DB_CACHE_TTL_MS)) {
    return cachedDb;
  }

  if (!forceFresh && inFlightDbLoad) {
    return inFlightDbLoad;
  }

  const fetchPromise = (async (): Promise<DatabaseSchema> => {
    try {
      const [asmRes, qRes, subRes, logRes, stuRes, drvRes, admRes] = await Promise.all([
        sb
          .from('assessments')
          .select(ASSESSMENT_COLUMNS)
          .order('created_at', { ascending: false }),
        sb
          .from('questions')
          .select(QUESTION_COLUMNS)
          .order('order_number', { ascending: true }),
        sb
          .from('submissions')
          .select(SUBMISSION_SUMMARY_COLUMNS)
          .order('submitted_at', { ascending: false })
          .limit(500),
        sb
          .from('anti_cheat_logs')
          .select(ANTI_CHEAT_COLUMNS)
          .order('timestamp', { ascending: false })
          .limit(100),
        sb.from('students').select(STUDENT_COLUMNS),
        sb
          .from('drive_assets')
          .select(DRIVE_ASSET_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(200),
        sb.from('admins').select(ADMIN_COLUMNS),
      ]);

      if (asmRes.error || qRes.error || subRes.error) {
        cachedDb = local;
        cachedDbAt = Date.now();
        return local;
      }

      let resolvedAdmins: AdminAccount[] =
        !admRes.error && Array.isArray(admRes.data)
          ? admRes.data.map(mapAdminFromDb)
          : local.admins;

      if (!admRes.error && Array.isArray(admRes.data) && !resolvedAdmins.some((a) => a.role === 'admin')) {
        const defaultAdmin = local.admins.find((a) => a.role === 'admin') || createDefaultAdmin();
        resolvedAdmins = [defaultAdmin, ...resolvedAdmins];
        try {
          await sb.from('admins').upsert(mapAdminToDb(defaultAdmin));
        } catch {
          // Ignore if RLS/schema prevents write
        }
      }

      const loaded: DatabaseSchema = {
        admins: resolvedAdmins,
        students:
          !stuRes.error && Array.isArray(stuRes.data)
            ? stuRes.data.map((r: any) => ({
                id: r.id,
                nisn: r.nisn,
                name: r.name,
                className: r.class_name,
                pin: r.pin,
              }))
            : local.students,
        assessments: (asmRes.data || []).map(mapAssessmentFromDb),
        questions: (qRes.data || []).map(mapQuestionFromDb),
        submissions: (subRes.data || []).map(mapSubmissionFromDb),
        antiCheatLogs:
          !logRes.error && Array.isArray(logRes.data)
            ? logRes.data.map((r: any) => ({
                id: r.id,
                assessmentId: r.assessment_id,
                assessmentTitle: r.assessment_title,
                studentId: r.student_id,
                studentNisn: r.student_nisn,
                studentName: r.student_name,
                className: r.class_name,
                eventType: r.event_type,
                detail: r.detail,
                violationNumber: r.violation_number,
                timestamp: r.timestamp,
              }))
            : local.antiCheatLogs,
        driveAssets:
          !drvRes.error && Array.isArray(drvRes.data)
            ? drvRes.data.map((r: any) => ({
                id: r.id,
                name: r.name,
                mimeType: r.mime_type,
                mediaKind: r.media_kind,
                sizeBytes: Number(r.size_bytes),
                url: r.url,
                driveFileId: r.drive_file_id || undefined,
                source: r.source,
                uploadedBy: r.uploaded_by,
                createdAt: r.created_at,
              }))
            : local.driveAssets,
        siteSettings: cachedSettings || local.siteSettings,
      };

      cachedDb = loaded;
      cachedDbAt = Date.now();
      return loaded;
    } catch (err) {
      console.warn('Supabase fallback to local store:', err);
      cachedDb = local;
      cachedDbAt = Date.now();
      return local;
    } finally {
      inFlightDbLoad = null;
    }
  })();

  inFlightDbLoad = fetchPromise;
  return fetchPromise;
}

export async function hasAnyAdminAccount(): Promise<boolean> {
  if ((process.env.ADMIN_PASSCODE || '').trim().length > 0) {
    return true;
  }
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('admins')
        .select('id')
        .eq('role', 'admin')
        .limit(1);
      if (!error && Array.isArray(data)) {
        if (data.length > 0) return true;
        // Also check local fallback in case admins table was just created
      }
    } catch {
      // Fallback to local check
    }
  }
  const db = await loadDb();
  return db.admins.some((a) => a.role === 'admin');
}

export async function authenticateStudent(
  nisn: string,
  pin: string
): Promise<StudentAccount | null> {
  if (cachedDb && isCacheFresh(cachedDbAt, DB_CACHE_TTL_MS)) {
    return cachedDb.students.find((s) => s.nisn === nisn && s.pin === pin) || null;
  }

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('students')
        .select(STUDENT_COLUMNS)
        .eq('nisn', nisn)
        .maybeSingle();
      if (!error) {
        if (data && data.pin === pin) {
          return {
            id: data.id,
            nisn: data.nisn,
            name: data.name,
            className: data.class_name,
            pin: data.pin,
          };
        }
        return null;
      }
    } catch {
      // Fallback to local store
    }
  }

  const local = ensureLocalStore();
  return local.students.find((s) => s.nisn === nisn && s.pin === pin) || null;
}

export async function getSubmissionById(id: string): Promise<SubmissionRecord | null> {
  if (cachedDb) {
    const inCache = cachedDb.submissions.find((s) => s.id === id);
    if (inCache && inCache.gradedItems.length > 0) {
      return inCache;
    }
  }

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('submissions')
        .select(SUBMISSION_DETAIL_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        const mapped = mapSubmissionFromDb(data);
        if (cachedDb) {
          const idx = cachedDb.submissions.findIndex((s) => s.id === id);
          if (idx >= 0) cachedDb.submissions[idx] = mapped;
        }
        return mapped;
      }
    } catch {
      // Fall through to local store
    }
  }

  const db = await loadDb();
  return db.submissions.find((s) => s.id === id) || null;
}

export async function upsertAssessment(assessment: Assessment): Promise<{
  assessment: Assessment;
  savedToSupabase: boolean;
  storageWarning?: string;
}> {
  const dbData = ensureLocalStore();
  const idx = dbData.assessments.findIndex((a) => a.id === assessment.id);
  if (idx >= 0) dbData.assessments[idx] = assessment;
  else dbData.assessments.unshift(assessment);
  saveLocalStore(dbData);

  if (cachedDb) {
    const cIdx = cachedDb.assessments.findIndex((a) => a.id === assessment.id);
    if (cIdx >= 0) cachedDb.assessments[cIdx] = assessment;
    else cachedDb.assessments.unshift(assessment);
  }

  let savedToSupabase = false;
  let storageWarning: string | undefined;
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb.from('assessments').upsert(mapAssessmentToDb(assessment));
      if (error) {
        storageWarning = `Jadwal asesmen tersimpan sementara di server lokal, namun Supabase mengembalikan error: ${error.message}`;
      } else {
        savedToSupabase = true;
      }
    } catch (err) {
      storageWarning =
        err instanceof Error
          ? `Jadwal asesmen tersimpan lokal, namun gagal sinkron ke Supabase: ${err.message}`
          : 'Jadwal asesmen tersimpan lokal, namun gagal sinkron ke Supabase.';
    }
  }
  return { assessment, savedToSupabase, storageWarning };
}

export async function deleteAssessmentById(id: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.assessments = dbData.assessments.filter((a) => a.id !== id);
  dbData.questions = dbData.questions.filter((q) => q.assessmentId !== id);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.assessments = cachedDb.assessments.filter((a) => a.id !== id);
    cachedDb.questions = cachedDb.questions.filter((q) => q.assessmentId !== id);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('assessments').delete().eq('id', id);
  }
}

export async function upsertQuestion(question: Question): Promise<Question> {
  const dbData = ensureLocalStore();
  const idx = dbData.questions.findIndex((q) => q.id === question.id);
  if (idx >= 0) dbData.questions[idx] = question;
  else dbData.questions.push(question);
  saveLocalStore(dbData);

  if (cachedDb) {
    const cIdx = cachedDb.questions.findIndex((q) => q.id === question.id);
    if (cIdx >= 0) cachedDb.questions[cIdx] = question;
    else cachedDb.questions.push(question);
  }

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from('questions').upsert(mapQuestionToDb(question, false));
    if (error) {
      if (/check constraint|questions_type_check/i.test(error.message)) {
        const retry = await sb.from('questions').upsert(mapQuestionToDb(question, true));
        if (retry.error) {
          console.warn('[CBT] Supabase upsertQuestion retry warning:', retry.error.message);
        }
      } else {
        console.warn('[CBT] Supabase upsertQuestion warning:', error.message);
      }
    }
  }
  return question;
}

export async function upsertQuestionsBatch(questions: Question[]): Promise<Question[]> {
  if (questions.length === 0) return [];
  const dbData = ensureLocalStore();
  for (const q of questions) {
    const idx = dbData.questions.findIndex((item) => item.id === q.id);
    if (idx >= 0) dbData.questions[idx] = q;
    else dbData.questions.push(q);
  }
  saveLocalStore(dbData);

  if (cachedDb) {
    for (const q of questions) {
      const cIdx = cachedDb.questions.findIndex((item) => item.id === q.id);
      if (cIdx >= 0) cachedDb.questions[cIdx] = q;
      else cachedDb.questions.push(q);
    }
  }

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from('questions').upsert(questions.map((q) => mapQuestionToDb(q, false)));
    if (error) {
      if (/check constraint|questions_type_check/i.test(error.message)) {
        const retry = await sb.from('questions').upsert(questions.map((q) => mapQuestionToDb(q, true)));
        if (retry.error) {
          console.warn('[CBT] Supabase upsertQuestionsBatch retry warning:', retry.error.message);
        }
      } else {
        console.warn('[CBT] Supabase upsertQuestionsBatch warning:', error.message);
      }
    }
  }
  return questions;
}

export async function deleteQuestionById(id: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.questions = dbData.questions.filter((q) => q.id !== id);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.questions = cachedDb.questions.filter((q) => q.id !== id);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('questions').delete().eq('id', id);
  }
}

export async function deleteQuestionsByAssessmentId(assessmentId: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.questions = dbData.questions.filter((q) => q.assessmentId !== assessmentId);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.questions = cachedDb.questions.filter((q) => q.assessmentId !== assessmentId);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('questions').delete().eq('assessment_id', assessmentId);
  }
}

export async function saveSubmission(submission: SubmissionRecord): Promise<SubmissionRecord> {
  const dbData = ensureLocalStore();
  const idx = dbData.submissions.findIndex((s) => s.id === submission.id);
  if (idx >= 0) dbData.submissions[idx] = submission;
  else dbData.submissions.unshift(submission);
  saveLocalStore(dbData);

  if (submission.gradedItems.length > 0) {
    hydratedSubmissionDetails.set(submission.id, submission.gradedItems);
  }

  if (cachedDb) {
    const cIdx = cachedDb.submissions.findIndex((s) => s.id === submission.id);
    if (cIdx >= 0) cachedDb.submissions[cIdx] = submission;
    else cachedDb.submissions.unshift(submission);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('submissions').upsert(mapSubmissionToDb(submission));
  }
  return submission;
}

export async function deleteSubmissionById(id: string): Promise<{
  savedToSupabase: boolean;
  storageWarning?: string;
}> {
  const dbData = ensureLocalStore();
  dbData.submissions = dbData.submissions.filter((s) => s.id !== id);
  saveLocalStore(dbData);

  hydratedSubmissionDetails.delete(id);
  if (cachedDb) {
    cachedDb.submissions = cachedDb.submissions.filter((s) => s.id !== id);
  }

  let savedToSupabase = false;
  let storageWarning: string | undefined;
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb.from('submissions').delete().eq('id', id);
      if (error) {
        storageWarning = `Data nilai direset di server lokal, namun Supabase mengembalikan error: ${error.message}`;
      } else {
        savedToSupabase = true;
      }
    } catch (err) {
      storageWarning =
        err instanceof Error
          ? `Data nilai direset lokal, namun gagal sinkron ke Supabase: ${err.message}`
          : 'Data nilai direset lokal, namun gagal sinkron ke Supabase.';
    }
  }
  return { savedToSupabase, storageWarning };
}

export async function markSubmissionsBackedUpBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const dbData = ensureLocalStore();
  dbData.submissions = dbData.submissions.map((s) =>
    idSet.has(s.id) ? { ...s, backedUpToDrive: true } : s
  );
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.submissions = cachedDb.submissions.map((s) =>
      idSet.has(s.id) ? { ...s, backedUpToDrive: true } : s
    );
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('submissions').update({ backed_up_to_drive: true }).in('id', ids);
  }
}

export async function appendAntiCheatLog(log: AntiCheatLog): Promise<AntiCheatLog> {
  const dbData = ensureLocalStore();
  dbData.antiCheatLogs.unshift(log);
  if (dbData.antiCheatLogs.length > 500) {
    dbData.antiCheatLogs = dbData.antiCheatLogs.slice(0, 500);
  }
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.antiCheatLogs.unshift(log);
    if (cachedDb.antiCheatLogs.length > 100) {
      cachedDb.antiCheatLogs = cachedDb.antiCheatLogs.slice(0, 100);
    }
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('anti_cheat_logs').insert({
      id: log.id,
      assessment_id: log.assessmentId,
      assessment_title: log.assessmentTitle,
      student_id: log.studentId,
      student_nisn: log.studentNisn,
      student_name: log.studentName,
      class_name: log.className,
      event_type: log.eventType,
      detail: log.detail,
      violation_number: log.violationNumber,
      timestamp: log.timestamp,
    });
  }
  return log;
}

export async function addStudent(student: StudentAccount): Promise<{
  student: StudentAccount;
  savedToSupabase: boolean;
  storageWarning?: string;
}> {
  let finalStudent = { ...student };
  const sb = getSupabase();
  let savedToSupabase = false;
  let storageWarning: string | undefined;

  if (sb) {
    try {
      // Preserve existing id if NISN already exists in Supabase to avoid unique constraint conflicts
      const existingLookup = await sb
        .from('students')
        .select('id')
        .eq('nisn', finalStudent.nisn)
        .maybeSingle();

      if (!existingLookup.error && existingLookup.data?.id) {
        finalStudent = { ...finalStudent, id: existingLookup.data.id };
      }

      const { error: upsertError } = await sb.from('students').upsert({
        id: finalStudent.id,
        nisn: finalStudent.nisn,
        name: finalStudent.name,
        class_name: finalStudent.className,
        pin: finalStudent.pin,
      });

      if (upsertError) {
        const msg = upsertError.message || 'Gagal menyimpan ke tabel students Supabase.';
        if (/could not find the table|relation .* does not exist/i.test(msg)) {
          storageWarning =
            'Akun siswa tersimpan sementara di penyimpanan lokal karena tabel "students" di Supabase belum dibuat. Jalankan Skema SQL di tab Supabase & GAS agar tersimpan permanen.';
        } else if (/permission denied|row-level security|not allowed/i.test(msg)) {
          storageWarning = `Akun siswa tersimpan sementara di server lokal, namun Supabase menolak penulisan (${msg}). Jalankan ulang Skema SQL terbaru (dengan GRANT service_role) di Supabase SQL Editor dan periksa SUPABASE_SECRET_KEY.`;
        } else {
          storageWarning = `Akun siswa tersimpan sementara di server lokal, namun sinkronisasi Supabase gagal: ${msg}`;
        }
      } else {
        savedToSupabase = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi Supabase.';
      storageWarning = `Akun siswa tersimpan sementara di server lokal, namun gagal sinkron ke Supabase: ${msg}`;
    }
  }

  const dbData = ensureLocalStore();
  const idx = dbData.students.findIndex(
    (s) => s.nisn === finalStudent.nisn || s.id === finalStudent.id
  );
  if (idx >= 0) dbData.students[idx] = finalStudent;
  else dbData.students.push(finalStudent);
  saveLocalStore(dbData);

  if (cachedDb) {
    const cIdx = cachedDb.students.findIndex(
      (s) => s.nisn === finalStudent.nisn || s.id === finalStudent.id
    );
    if (cIdx >= 0) cachedDb.students[cIdx] = finalStudent;
    else cachedDb.students.push(finalStudent);
  }

  return { student: finalStudent, savedToSupabase, storageWarning };
}

export async function deleteStudentById(id: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.students = dbData.students.filter((s) => s.id !== id);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.students = cachedDb.students.filter((s) => s.id !== id);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('students').delete().eq('id', id);
  }
}

export async function upsertStaff(staff: AdminAccount): Promise<AdminAccount> {
  const storedPassword = staff.password.startsWith('scrypt:')
    ? staff.password
    : hashPassword(staff.password);
  const record: AdminAccount = { ...staff, password: storedPassword };

  const dbData = ensureLocalStore();
  const idx = dbData.admins.findIndex(
    (a) => a.id === record.id || a.username.toLowerCase() === record.username.toLowerCase()
  );
  if (idx >= 0) dbData.admins[idx] = record;
  else dbData.admins.push(record);
  saveLocalStore(dbData);

  if (cachedDb) {
    const cIdx = cachedDb.admins.findIndex(
      (a) => a.id === record.id || a.username.toLowerCase() === record.username.toLowerCase()
    );
    if (cIdx >= 0) cachedDb.admins[cIdx] = record;
    else cachedDb.admins.push(record);
  }

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('admins').upsert(mapAdminToDb(record));
    } catch {
      // Graceful fallback if public.admins table has not been migrated yet
    }
  }

  return record;
}

export async function deleteStaffById(id: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.admins = dbData.admins.filter((a) => a.id !== id);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.admins = cachedDb.admins.filter((a) => a.id !== id);
  }

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('admins').delete().eq('id', id);
    } catch {
      // Graceful fallback
    }
  }
}

export async function saveDriveAsset(asset: DriveAsset): Promise<DriveAsset> {
  const dbData = ensureLocalStore();
  dbData.driveAssets.unshift(asset);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.driveAssets.unshift(asset);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('drive_assets').upsert({
      id: asset.id,
      name: asset.name,
      mime_type: asset.mimeType,
      media_kind: asset.mediaKind,
      size_bytes: asset.sizeBytes,
      url: asset.url,
      drive_file_id: asset.driveFileId || null,
      source: asset.source,
      uploaded_by: asset.uploadedBy,
      created_at: asset.createdAt,
    });
  }
  return asset;
}

export async function removeDriveAsset(id: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.driveAssets = dbData.driveAssets.filter((d) => d.id !== id);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.driveAssets = cachedDb.driveAssets.filter((d) => d.id !== id);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('drive_assets').delete().eq('id', id);
  }
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cachedSettings && isCacheFresh(cachedSettingsAt, SETTINGS_CACHE_TTL_MS)) {
    return cachedSettings;
  }
  if (inFlightSettingsLoad) {
    return inFlightSettingsLoad;
  }

  const fetchPromise = (async (): Promise<SiteSettings> => {
    const local = ensureLocalStore();
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('site_settings')
          .select(SITE_SETTINGS_COLUMNS)
          .eq('id', 'default')
          .maybeSingle();
        if (!error && data) {
          const resolved: SiteSettings = {
            appName: data.app_name || DEFAULT_SITE_SETTINGS.appName,
            schoolName: data.school_name || DEFAULT_SITE_SETTINGS.schoolName,
            tagline: data.tagline || DEFAULT_SITE_SETTINGS.tagline,
            eyebrowText: data.eyebrow_text || DEFAULT_SITE_SETTINGS.eyebrowText,
            heroTitle: data.hero_title || DEFAULT_SITE_SETTINGS.heroTitle,
            heroSubtitle: data.hero_subtitle || DEFAULT_SITE_SETTINGS.heroSubtitle,
            loginHeading: data.login_heading || DEFAULT_SITE_SETTINGS.loginHeading,
            logoUrl: data.logo_url || DEFAULT_SITE_SETTINGS.logoUrl,
            backgroundImageUrl:
              data.background_image_url ?? DEFAULT_SITE_SETTINGS.backgroundImageUrl,
            showQuickDemo: false,
            updatedAt: data.updated_at || local.siteSettings.updatedAt,
          };
          cachedSettings = resolved;
          cachedSettingsAt = Date.now();
          return resolved;
        }
      } catch {
        // Fall back silently to local store if site_settings table doesn't exist yet
      }
    }
    const fallback = local.siteSettings || { ...DEFAULT_SITE_SETTINGS };
    cachedSettings = fallback;
    cachedSettingsAt = Date.now();
    return fallback;
  })();

  inFlightSettingsLoad = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    inFlightSettingsLoad = null;
  }
}

export async function saveSiteSettings(next: SiteSettings): Promise<SiteSettings> {
  const dbData = ensureLocalStore();
  const merged: SiteSettings = {
    ...DEFAULT_SITE_SETTINGS,
    ...next,
    showQuickDemo: false,
    updatedAt: new Date().toISOString(),
  };
  dbData.siteSettings = merged;
  saveLocalStore(dbData);

  cachedSettings = merged;
  cachedSettingsAt = Date.now();
  if (cachedDb) {
    cachedDb.siteSettings = merged;
  }

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('site_settings').upsert({
        id: 'default',
        app_name: merged.appName,
        school_name: merged.schoolName,
        tagline: merged.tagline,
        eyebrow_text: merged.eyebrowText,
        hero_title: merged.heroTitle,
        hero_subtitle: merged.heroSubtitle,
        login_heading: merged.loginHeading,
        logo_url: merged.logoUrl,
        background_image_url: merged.backgroundImageUrl,
        show_quick_demo: false,
        updated_at: merged.updatedAt,
      });
    } catch {
      // Keep local store updated even if site_settings table is not yet migrated in Supabase
    }
  }
  return merged;
}
