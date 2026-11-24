export const SUPABASE_SQL_SCHEMA = `-- =========================================================================
-- SKEMA DATABASE SUPABASE - CBT MI MA'ARIF AL IHSAN SOBOREJO
-- Jalankan script ini di Supabase Dashboard -> SQL Editor
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.assessments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  semester TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  token TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  max_violations INTEGER NOT NULL DEFAULT 3,
  shuffle_questions BOOLEAN NOT NULL DEFAULT true,
  show_instant_result BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_teacher_id TEXT,
  assigned_teacher_name TEXT,
  scheduled_date TEXT,
  schedule_window TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pg', 'pgk', 'essay')),
  domain TEXT NOT NULL,
  cognitive_level TEXT NOT NULL,
  stimulus_title TEXT,
  stimulus_passage TEXT,
  image_url TEXT,
  image_caption TEXT,
  video_url TEXT,
  video_caption TEXT,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option_id TEXT,
  correct_option_ids JSONB DEFAULT '[]'::jsonb,
  essay_keywords JSONB DEFAULT '[]'::jsonb,
  essay_sample_answer TEXT,
  max_points NUMERIC(6,2) NOT NULL DEFAULT 10,
  author_id TEXT,
  author_name TEXT
);

CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  nisn TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  pin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  assessment_title TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_nisn TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  violation_count INTEGER NOT NULL DEFAULT 0,
  auto_submitted_by_security BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  total_points_earned NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_points_max NUMERIC(8,2) NOT NULL DEFAULT 0,
  final_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  predicate TEXT NOT NULL,
  domain_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  graded_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_to_supabase BOOLEAN NOT NULL DEFAULT true,
  backed_up_to_drive BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.anti_cheat_logs (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  assessment_title TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_nisn TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  violation_number INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.drive_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  drive_file_id TEXT,
  source TEXT NOT NULL DEFAULT 'google_drive_gas',
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admins (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'guru')),
  subject_area TEXT,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  app_name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  eyebrow_text TEXT NOT NULL,
  hero_title TEXT NOT NULL,
  hero_subtitle TEXT NOT NULL,
  login_heading TEXT NOT NULL,
  logo_url TEXT NOT NULL DEFAULT '',
  background_image_url TEXT NOT NULL DEFAULT '',
  show_quick_demo BOOLEAN NOT NULL DEFAULT false,
  gas_webapp_url TEXT NOT NULL DEFAULT '',
  gas_folder_id TEXT NOT NULL DEFAULT '',
  gas_api_secret TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS gas_webapp_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS gas_folder_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS gas_api_secret TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_questions_assessment ON public.questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessments_teacher ON public.assessments(assigned_teacher_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assessment ON public.submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.submissions(student_nisn);
CREATE INDEX IF NOT EXISTS idx_logs_assessment ON public.anti_cheat_logs(assessment_id);

-- Pastikan role backend (service_role / SUPABASE_SECRET_KEY) memiliki izin penuh ke seluruh tabel
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
`;

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT (Code.gs) - PENGELOLA GOOGLE DRIVE CBT
 * MI MA'ARIF AL IHSAN SOBOREJO
 *
 * Petunjuk Pemasangan:
 * 1. Buka https://script.google.com -> Buat Proyek Baru.
 * 2. Tempel seluruh kode ini ke file Code.gs.
 * 3. Buat folder di Google Drive untuk CBT, salin ID foldernya ke DRIVE_FOLDER_ID.
 * 4. Isi SHARED_SECRET yang sama dengan env var GAS_API_SECRET di aplikasi.
 * 5. Klik Deploy -> New deployment -> Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Salin URL Web App (/exec) ke env var GAS_DRIVE_WEBAPP_URL di Secrets.
 * =========================================================================
 */

const DRIVE_FOLDER_ID = 'GANTI_DENGAN_ID_FOLDER_GOOGLE_DRIVE_MADRASAH';
const SHARED_SECRET = 'GANTI_DENGAN_RAHASIA_CBT_AL_IHSAN';

function getTargetFolder() {
  if (DRIVE_FOLDER_ID && !DRIVE_FOLDER_ID.startsWith('GANTI_')) {
    return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  }
  const folders = DriveApp.getFoldersByName('CBT_MI_MAARIF_AL_IHSAN_SOBOREJO');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('CBT_MI_MAARIF_AL_IHSAN_SOBOREJO');
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAuthorized(secretParam) {
  if (!SHARED_SECRET || SHARED_SECRET.startsWith('GANTI_')) return true;
  return secretParam === SHARED_SECRET;
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  if (!isAuthorized(params.secret)) {
    return jsonResponse({ ok: false, error: 'Unauthorized secret' });
  }

  const action = params.action || 'list';
  const folder = getTargetFolder();

  if (action === 'list') {
    const files = folder.getFiles();
    const items = [];
    while (files.hasNext()) {
      const f = files.next();
      const mime = f.getMimeType();
      let mediaKind = 'document';
      if (mime.indexOf('image/') === 0) mediaKind = 'image';
      else if (mime.indexOf('video/') === 0) mediaKind = 'video';
      else if (mime.indexOf('spreadsheet') !== -1 || mime.indexOf('csv') !== -1) mediaKind = 'spreadsheet';

      items.push({
        id: 'gas-' + f.getId(),
        driveFileId: f.getId(),
        name: f.getName(),
        mimeType: mime,
        mediaKind: mediaKind,
        sizeBytes: f.getSize(),
        url: mime.indexOf('image/') === 0
          ? 'https://lh3.googleusercontent.com/d/' + f.getId()
          : 'https://drive.google.com/uc?export=download&id=' + f.getId(),
        source: 'google_drive_gas',
        uploadedBy: 'Google Drive GAS',
        createdAt: f.getDateCreated().toISOString()
      });
    }
    return jsonResponse({ ok: true, folderId: folder.getId(), files: items });
  }

  return jsonResponse({ ok: true, message: 'CBT GAS Drive WebApp Active' });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  if (!isAuthorized(body.secret)) {
    return jsonResponse({ ok: false, error: 'Unauthorized secret' });
  }

  const folder = getTargetFolder();

  if (body.action === 'uploadMedia') {
    const bytes = Utilities.base64Decode(body.base64Data);
    const blob = Utilities.newBlob(bytes, body.mimeType, body.fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const isImage = (body.mimeType || '').indexOf('image/') === 0;
    const directUrl = isImage
      ? 'https://lh3.googleusercontent.com/d/' + file.getId()
      : 'https://drive.google.com/uc?export=download&id=' + file.getId();

    return jsonResponse({
      ok: true,
      file: {
        id: 'gas-' + file.getId(),
        driveFileId: file.getId(),
        name: file.getName(),
        mimeType: file.getMimeType(),
        mediaKind: isImage ? 'image' : 'video',
        sizeBytes: file.getSize(),
        url: directUrl,
        source: 'google_drive_gas',
        uploadedBy: body.uploadedBy || 'Guru/Proktor',
        createdAt: new Date().toISOString()
      }
    });
  }

  if (body.action === 'backupScoresCsv') {
    const fileName = body.fileName || ('Rekap_Nilai_CBT_' + new Date().toISOString().slice(0, 10) + '.csv');
    const blob = Utilities.newBlob(body.csvContent, 'text/csv', fileName);
    const file = folder.createFile(blob);
    return jsonResponse({
      ok: true,
      driveFileId: file.getId(),
      name: file.getName(),
      url: file.getUrl()
    });
  }

  if (body.action === 'deleteFile' && body.driveFileId) {
    DriveApp.getFileById(body.driveFileId).setTrashed(true);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: 'Unknown action' });
}
`;
