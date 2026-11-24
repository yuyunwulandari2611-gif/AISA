export type UserRole = 'student' | 'guru' | 'admin';

export type QuestionType = 'pg' | 'pgk' | 'pgk_kategori' | 'isian' | 'essay';

export type QuestionDomain =
  | 'Literasi Membaca'
  | 'Numerasi'
  | 'Literasi Sains'
  | 'PAI & Akhlak';

export type CognitiveLevel = 'L1 Pemahaman' | 'L2 Penerapan' | 'L3 Penalaran';

export type AssessmentCategory =
  | 'Asesmen Sumatif Akhir Semester'
  | 'Asesmen Tengah Semester'
  | 'Try Out AKM'
  | 'Asesmen Harian';

export interface QuestionOption {
  id: string;
  label: string;
  text: string;
  imageUrl?: string;
  categoryPair?: [string, string];
}

export interface Question {
  id: string;
  assessmentId: string;
  orderNumber: number;
  type: QuestionType;
  domain: QuestionDomain;
  cognitiveLevel: CognitiveLevel;
  stimulusTitle?: string;
  stimulusPassage?: string;
  imageUrl?: string;
  imageCaption?: string;
  videoUrl?: string;
  videoCaption?: string;
  prompt: string;
  options: QuestionOption[];
  categoryLabels?: [string, string];
  correctOptionId?: string;
  correctOptionIds?: string[];
  essayKeywords?: string[];
  essaySampleAnswer?: string;
  maxPoints: number;
  authorId?: string;
  authorName?: string;
}

export interface SafeQuestion extends Omit<
  Question,
  'correctOptionId' | 'correctOptionIds' | 'essayKeywords' | 'essaySampleAnswer'
> {}

export interface Assessment {
  id: string;
  title: string;
  category: AssessmentCategory;
  subject: string;
  gradeLevel: string;
  semester: string;
  academicYear: string;
  token: string;
  durationMinutes: number;
  maxViolations: number;
  shuffleQuestions: boolean;
  showInstantResult: boolean;
  status: 'active' | 'draft' | 'archived';
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  scheduledDate?: string;
  scheduleWindow?: string;
  createdAt: string;
}

export interface StudentAccount {
  id: string;
  nisn: string;
  name: string;
  className: string;
  pin: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  name: string;
  title: string;
  role: 'admin' | 'guru';
  subjectArea?: string;
  password: string;
}

export interface SessionUser {
  id: string;
  role: UserRole;
  identifier: string; // NISN for peserta ujian, username/NIP for guru & admin
  name: string;
  className?: string;
  title?: string;
  subjectArea?: string;
}

export interface StudentAnswerPayload {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  categoryAnswers?: Record<string, 'A' | 'B'>;
  shortAnswerText?: string;
  essayText?: string;
}

export interface GradedQuestionResult {
  questionId: string;
  orderNumber: number;
  type: QuestionType;
  domain: QuestionDomain;
  prompt: string;
  studentAnswerText: string;
  maxPoints: number;
  earnedPoints: number;
  status: 'correct' | 'partial' | 'incorrect' | 'auto_rubric' | 'teacher_adjusted';
  matchedKeywords: string[];
  missedKeywords: string[];
  feedback: string;
}

export interface SubmissionRecord {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  studentId: string;
  studentNisn: string;
  studentName: string;
  className: string;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  violationCount: number;
  autoSubmittedBySecurity: boolean;
  isLocked: boolean;
  totalPointsEarned: number;
  totalPointsMax: number;
  finalScore: number; // 0 - 100
  predicate: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Perlu Bimbingan';
  domainBreakdown: {
    domain: string;
    earned: number;
    max: number;
    percentage: number;
  }[];
  gradedItems: GradedQuestionResult[];
  syncedToSupabase: boolean;
  backedUpToDrive: boolean;
}

export interface AntiCheatLog {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  studentId: string;
  studentNisn: string;
  studentName: string;
  className: string;
  eventType:
    | 'TAB_SWITCH'
    | 'WINDOW_BLUR'
    | 'FULLSCREEN_EXIT'
    | 'COPY_ATTEMPT'
    | 'CONTEXT_MENU'
    | 'DEVTOOLS_SHORTCUT'
    | 'AUTO_LOCKOUT';
  detail: string;
  violationNumber: number;
  timestamp: string;
}

export interface DriveAsset {
  id: string;
  name: string;
  mimeType: string;
  mediaKind: 'image' | 'video' | 'spreadsheet' | 'document';
  sizeBytes: number;
  url: string;
  driveFileId?: string;
  driveUrl?: string;
  source: 'google_drive_gas' | 'local_madrasah';
  uploadedBy: string;
  createdAt: string;
}

export interface IntegrationStatus {
  supabaseConfigured: boolean;
  supabaseUrlConfigured?: boolean;
  supabaseSecretConfigured?: boolean;
  supabaseProjectHost: string | null;
  supabasePublishableConfigured: boolean;
  supabaseJwksUrl: string | null;
  supabaseTablesReady: boolean;
  supabaseMissingTables: string[];
  gasDriveConfigured: boolean;
  gasDriveWebappUrl: string | null;
  gasFolderId: string | null;
  gasSecretConfigured: boolean;
  gasConfigSource: 'admin_panel' | 'env' | 'none';
  storageMode: 'supabase' | 'local_persistent';
  runtimePlatform?: 'vercel' | 'node';
}

export interface SupabaseTableCheck {
  table: string;
  ok: boolean;
  rowCount: number | null;
  error?: string;
}

export interface SupabaseTestResult {
  configured: boolean;
  connected: boolean;
  tablesReady: boolean;
  latencyMs: number;
  projectHost: string | null;
  tables: SupabaseTableCheck[];
  error: string | null;
}

export interface GasTestResult {
  configured: boolean;
  reachable: boolean;
  latencyMs: number;
  webappUrl: string | null;
  folderId: string | null;
  fileCount: number | null;
  error: string | null;
}

export interface SiteSettings {
  appName: string;
  schoolName: string;
  tagline: string;
  eyebrowText: string;
  heroTitle: string;
  heroSubtitle: string;
  loginHeading: string;
  logoUrl: string;
  backgroundImageUrl: string;
  showQuickDemo: boolean;
  updatedAt: string;
}

