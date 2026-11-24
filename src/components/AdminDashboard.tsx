import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Database,
  Download,
  Edit3,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Plus,
  Power,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { DriveMediaManager, IntegrationConfigPanel } from './IntegrationPanel.tsx';
import { LandingSettingsPanel } from './LandingSettingsPanel.tsx';
import { QuestionEditorModal } from './QuestionEditorModal.tsx';
import { QuestionImportModal } from './QuestionImportModal.tsx';
import { authFetch } from '../lib/authClient.ts';
import type {
  AntiCheatLog,
  Assessment,
  AssessmentCategory,
  DriveAsset,
  IntegrationStatus,
  Question,
  SessionUser,
  SiteSettings,
  StudentAccount,
  SubmissionRecord,
} from '../types/cbt.ts';

interface EnrichedAssessment extends Assessment {
  questionCount: number;
  submissionCount: number;
}

interface StaffSummary {
  id: string;
  username: string;
  name: string;
  title: string;
  role: 'admin' | 'guru';
  subjectArea?: string;
}

type NavTab =
  | 'overview'
  | 'gradebook'
  | 'assessments'
  | 'anticheat'
  | 'drive'
  | 'users'
  | 'appearance'
  | 'integrations';

interface AdminDashboardProps {
  user: SessionUser;
  onLogout: () => void;
  onSiteSettingsUpdated?: (settings: SiteSettings) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  onLogout,
  onSiteSettingsUpdated,
}) => {
  const isAdmin = user.role === 'admin';
  const isGuru = user.role === 'guru';
  const [activeTab, setActiveTab] = useState<NavTab>('overview');

  const [assessments, setAssessments] = useState<EnrichedAssessment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [logs, setLogs] = useState<AntiCheatLog[]>([]);
  const [driveAssets, setDriveAssets] = useState<DriveAsset[]>([]);
  const [gasReachable, setGasReachable] = useState(false);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [staffList, setStaffList] = useState<StaffSummary[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [supabaseSql, setSupabaseSql] = useState('');
  const [gasCode, setGasCode] = useState('');
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  // Gradebook filters & calibration drawer
  const [gradeAssessmentFilter, setGradeAssessmentFilter] = useState('all');
  const [gradeSearch, setGradeSearch] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRecord | null>(null);
  const [calibratedScores, setCalibratedScores] = useState<Record<string, number>>({});
  const [savingCalibration, setSavingCalibration] = useState(false);
  const [backingUpDrive, setBackingUpDrive] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [confirmResetSub, setConfirmResetSub] = useState<SubmissionRecord | null>(null);
  const [resettingSubId, setResettingSubId] = useState<string | null>(null);
  const [gradebookFeedback, setGradebookFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Assessment & Question Bank states
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [togglingAssessmentId, setTogglingAssessmentId] = useState<string | null>(null);
  const [assessmentStatusFeedback, setAssessmentStatusFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [selectedAsmForQuestions, setSelectedAsmForQuestions] = useState<string | null>(null);
  const [asmQuestions, setAsmQuestions] = useState<Question[]>([]);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [confirmDeleteAsm, setConfirmDeleteAsm] = useState<Assessment | null>(null);
  const [confirmDeleteQuestion, setConfirmDeleteQuestion] = useState<Question | null>(null);

  // User Management (Admin only) - Rombel Kelas 1 s.d. Kelas 6
  const [userSubTab, setUserSubTab] = useState<'students' | 'staff'>('students');
  const [rombelFilter, setRombelFilter] = useState<string>('all');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState({
    nisn: '',
    name: '',
    gradeLevel: 'Kelas 6',
    rombel: 'A',
    pin: '',
  });
  const [savingStudent, setSavingStudent] = useState(false);
  const [studentFeedback, setStudentFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [newStaff, setNewStaff] = useState({
    username: '',
    name: '',
    title: '',
    role: 'guru' as 'guru' | 'admin',
    subjectArea: '',
    password: '',
  });
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffFeedback, setStaffFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{
    kind: 'student' | 'staff';
    id: string;
    label: string;
  } | null>(null);

  const loadAllData = async () => {
    const basePromises = [
      authFetch('/api/assessments'),
      authFetch('/api/submissions'),
      authFetch('/api/anti-cheat/logs'),
      authFetch('/api/drive/files'),
      fetch('/api/settings'),
    ];
    const adminPromises = isAdmin
      ? [authFetch('/api/users'), authFetch('/api/integrations/status')]
      : [];

    const [asmRes, subRes, logRes, drvRes, setRes, usrRes, intRes] = await Promise.all([
      ...basePromises,
      ...adminPromises,
    ]);

    const asmJson = asmRes.ok ? await asmRes.json() : { assessments: [] };
    const subJson = subRes.ok ? await subRes.json() : { submissions: [] };
    const logJson = logRes.ok ? await logRes.json() : { logs: [] };
    const drvJson = drvRes.ok ? await drvRes.json() : { files: [], gasReachable: false };
    const setJson = setRes.ok ? await setRes.json() : {};
    const usrJson = usrRes && usrRes.ok ? await usrRes.json() : { students: [], staff: [] };
    const intJson = intRes && intRes.ok ? await intRes.json() : {};

    const asmList: EnrichedAssessment[] = asmJson.assessments || [];
    setAssessments(asmList);
    if (asmList.length === 0) {
      setSelectedAsmForQuestions(null);
      setAsmQuestions([]);
    } else if (!selectedAsmForQuestions || !asmList.some((a) => a.id === selectedAsmForQuestions)) {
      setSelectedAsmForQuestions(asmList[0].id);
    }
    setSubmissions(subJson.submissions || []);
    setLogs(logJson.logs || []);
    setDriveAssets(drvJson.files || []);
    setGasReachable(Boolean(drvJson.gasReachable));
    if (isAdmin) {
      setStudents(usrJson.students || []);
      setStaffList(usrJson.staff || []);
      setIntegrationStatus(intJson.status || null);
      setSupabaseSql(intJson.supabaseSql || '');
      setGasCode(intJson.gasCode || '');
    }
    if (setJson.settings) {
      setSiteSettings(setJson.settings);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [user.id, user.role]);

  useEffect(() => {
    if (!selectedAsmForQuestions) {
      setAsmQuestions([]);
      return;
    }
    authFetch(`/api/questions/${selectedAsmForQuestions}`)
      .then((r) => (r.ok ? r.json() : { questions: [] }))
      .then((d) => setAsmQuestions(d.questions || []));
  }, [selectedAsmForQuestions, user.id, user.role]);

  const refreshAssessments = async () => {
    const res = await authFetch('/api/assessments');
    if (res.ok) {
      const json = await res.json();
      const asmList: EnrichedAssessment[] = json.assessments || [];
      setAssessments(asmList);
      if (asmList.length === 0) {
        setSelectedAsmForQuestions(null);
        setAsmQuestions([]);
      } else if (!selectedAsmForQuestions || !asmList.some((a) => a.id === selectedAsmForQuestions)) {
        setSelectedAsmForQuestions(asmList[0].id);
      }
    }
  };

  const refreshUsers = async () => {
    const res = await authFetch('/api/users');
    if (res.ok) {
      const json = await res.json();
      setStudents(json.students || []);
      setStaffList(json.staff || []);
    }
  };

  const refreshSubmissionsAndDrive = async () => {
    const [subRes, drvRes] = await Promise.all([
      authFetch('/api/submissions'),
      authFetch('/api/drive/files'),
    ]);
    if (subRes.ok) {
      const subJson = await subRes.json();
      setSubmissions(subJson.submissions || []);
    }
    if (drvRes.ok) {
      const drvJson = await drvRes.json();
      setDriveAssets(drvJson.files || []);
      setGasReachable(Boolean(drvJson.gasReachable));
    }
  };

  const [loadingDrawerDetail, setLoadingDrawerDetail] = useState(false);

  const openCalibrationDrawer = async (sub: SubmissionRecord) => {
    setSelectedSubmission(sub);
    const initial: Record<string, number> = {};
    sub.gradedItems.forEach((item) => {
      initial[item.questionId] = item.earnedPoints;
    });
    setCalibratedScores(initial);

    if (sub.gradedItems.length === 0) {
      setLoadingDrawerDetail(true);
      try {
        const res = await authFetch(`/api/submissions/${encodeURIComponent(sub.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.submission) {
            setSelectedSubmission(data.submission);
            const hydratedScores: Record<string, number> = {};
            (data.submission.gradedItems || []).forEach((item: any) => {
              hydratedScores[item.questionId] = item.earnedPoints;
            });
            setCalibratedScores(hydratedScores);
          }
        }
      } finally {
        setLoadingDrawerDetail(false);
      }
    }
  };

  const handleSaveCalibration = async (unlockSession = false) => {
    if (!selectedSubmission) return;
    setSavingCalibration(true);
    try {
      const updatedItems = selectedSubmission.gradedItems.map((item) => {
        const newScore = calibratedScores[item.questionId];
        const changed = newScore !== undefined && newScore !== item.earnedPoints;
        return {
          ...item,
          earnedPoints: newScore !== undefined ? Math.min(item.maxPoints, Math.max(0, newScore)) : item.earnedPoints,
          status: changed ? ('teacher_adjusted' as const) : item.status,
        };
      });

      const res = await authFetch(`/api/submissions/${selectedSubmission.id}/calibrate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradedItems: updatedItems,
          unlockSession,
        }),
      });
      const data = await res.json();
      if (res.ok && data.submission) {
        setSelectedSubmission(data.submission);
        setSubmissions((prev) =>
          prev.map((s) => (s.id === data.submission.id ? data.submission : s))
        );
      }
    } finally {
      setSavingCalibration(false);
    }
  };

  const handleConfirmResetSubmission = async () => {
    if (!confirmResetSub) return;
    const target = confirmResetSub;
    setResettingSubId(target.id);
    setGradebookFeedback(null);
    try {
      const res = await authFetch(`/api/submissions/${encodeURIComponent(target.id)}/reset`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGradebookFeedback({
          type: 'error',
          text: data.error || 'Gagal mereset data pengerjaan siswa.',
        });
        setConfirmResetSub(null);
        return;
      }

      setSubmissions((prev) => prev.filter((s) => s.id !== target.id));
      if (selectedSubmission?.id === target.id) {
        setSelectedSubmission(null);
      }
      setConfirmResetSub(null);
      await refreshAssessments();

      if (data.storageWarning) {
        setGradebookFeedback({ type: 'warning', text: data.storageWarning });
      } else {
        setGradebookFeedback({
          type: 'success',
          text: `Ujian "${target.assessmentTitle}" untuk ${target.studentName} (NISN ${target.studentNisn}) berhasil direset. Peserta kini dapat mengerjakan ulang untuk perbaikan/remedial.`,
        });
      }
    } catch {
      setGradebookFeedback({
        type: 'error',
        text: 'Terjadi gangguan jaringan saat mereset ujian peserta.',
      });
      setConfirmResetSub(null);
    } finally {
      setResettingSubId(null);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchesAsm =
      gradeAssessmentFilter === 'all' || s.assessmentId === gradeAssessmentFilter;
    const q = gradeSearch.trim().toLowerCase();
    const matchesQuery =
      !q ||
      s.studentName.toLowerCase().includes(q) ||
      s.studentNisn.toLowerCase().includes(q) ||
      s.className.toLowerCase().includes(q);
    return matchesAsm && matchesQuery;
  });

  const handleExportCsv = () => {
    const headers = [
      'NISN',
      'Nama Peserta',
      'Kelas',
      'Asesmen',
      'Nilai Akhir',
      'Predikat',
      'Pelanggaran',
      'Waktu Kumpul',
    ];
    const rows = filteredSubmissions.map((s) =>
      [
        `"${s.studentNisn}"`,
        `"${s.studentName.replace(/"/g, '""')}"`,
        `"${s.className}"`,
        `"${s.assessmentTitle.replace(/"/g, '""')}"`,
        s.finalScore,
        `"${s.predicate}"`,
        s.violationCount,
        `"${new Date(s.submittedAt).toLocaleString('id-ID')}"`,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Database_Nilai_CBT_Al_Ihsan_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBackupToDrive = async () => {
    setBackingUpDrive(true);
    setBackupFeedback(null);
    try {
      const res = await authFetch('/api/drive/backup-scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assessmentId: gradeAssessmentFilter }),
      });
      const data = await res.json();
      if (res.ok) {
        setBackupFeedback(
          `Berhasil mencadangkan ${data.count} nilai (${data.fileName}) ke ${
            data.syncedToGas ? 'Google Drive via Apps Script' : 'Arsip Media Madrasah'
          }.`
        );
        await refreshSubmissionsAndDrive();
      }
    } finally {
      setBackingUpDrive(false);
    }
  };

  const handleSaveAssessment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAssessmentError(null);
    setAssessmentStatusFeedback(null);
    const fd = new FormData(e.currentTarget);
    const assignedTeacherId = String(fd.get('assignedTeacherId') || '');
    const assignedTeacher = staffList.find((s) => s.id === assignedTeacherId);
    const payload: Assessment = {
      id: editingAssessment?.id || `asm-${Date.now()}`,
      title: String(fd.get('title') || ''),
      category: String(fd.get('category') || 'Asesmen Sumatif Akhir Semester') as AssessmentCategory,
      subject: String(fd.get('subject') || ''),
      gradeLevel: String(fd.get('gradeLevel') || 'Kelas 6'),
      semester: String(fd.get('semester') || 'Gasal'),
      academicYear: String(fd.get('academicYear') || '2026/2027'),
      token: String(fd.get('token') || '').trim().toUpperCase(),
      durationMinutes: Number(fd.get('durationMinutes') || 45),
      maxViolations: Number(fd.get('maxViolations') || 3),
      shuffleQuestions: fd.get('shuffleQuestions') === 'on',
      showInstantResult: fd.get('showInstantResult') === 'on',
      status: String(fd.get('status') || 'active') as Assessment['status'],
      assignedTeacherId: assignedTeacherId || undefined,
      assignedTeacherName: assignedTeacher?.name || editingAssessment?.assignedTeacherName,
      scheduledDate: String(fd.get('scheduledDate') || '') || undefined,
      scheduleWindow: String(fd.get('scheduleWindow') || '') || undefined,
      createdAt: editingAssessment?.createdAt || new Date().toISOString(),
    };

    const res = await authFetch('/api/assessments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAssessmentError(data.error || 'Gagal menyimpan jadwal penugasan asesmen.');
      return;
    }
    if (data.storageWarning) {
      setAssessmentStatusFeedback({ type: 'warning', text: data.storageWarning });
    } else {
      setAssessmentStatusFeedback({
        type: 'success',
        text: `Jadwal "${payload.title}" berhasil disimpan dengan status ${
          payload.status === 'active' ? 'Aktif' : 'Nonaktif (Draft)'
        }.`,
      });
    }
    setShowAssessmentModal(false);
    setEditingAssessment(null);
    await refreshAssessments();
  };

  const handleToggleAssessmentStatus = async (asm: EnrichedAssessment) => {
    const nextStatus: Assessment['status'] = asm.status === 'active' ? 'draft' : 'active';
    setTogglingAssessmentId(asm.id);
    setAssessmentStatusFeedback(null);
    try {
      const res = await authFetch(`/api/assessments/${encodeURIComponent(asm.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssessmentStatusFeedback({
          type: 'error',
          text: data.error || 'Gagal mengubah status aktif asesmen.',
        });
        return;
      }

      setAssessments((prev) =>
        prev.map((item) =>
          item.id === asm.id ? { ...item, status: data.assessment?.status || nextStatus } : item
        )
      );

      if (data.storageWarning) {
        setAssessmentStatusFeedback({
          type: 'warning',
          text: data.storageWarning,
        });
      } else {
        setAssessmentStatusFeedback({
          type: 'success',
          text:
            nextStatus === 'active'
              ? `Asesmen "${asm.title}" telah DIAKTIFKAN dan tampil di dasbor peserta ujian.`
              : `Asesmen "${asm.title}" telah DINONAKTIFKAN dan disembunyikan dari peserta ujian.`,
        });
      }
    } catch {
      setAssessmentStatusFeedback({
        type: 'error',
        text: 'Terjadi gangguan jaringan saat mengubah status asesmen.',
      });
    } finally {
      setTogglingAssessmentId(null);
    }
  };

  const handleSaveQuestion = async (question: Question) => {
    const res = await authFetch('/api/questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(question),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan butir soal.');
    }
    const qRes = await authFetch(`/api/questions/${question.assessmentId}`);
    const qJson = await qRes.json();
    const nextQuestions: Question[] = qJson.questions || [];
    setAsmQuestions(nextQuestions);
    setAssessments((prev) =>
      prev.map((a) =>
        a.id === question.assessmentId ? { ...a, questionCount: nextQuestions.length } : a
      )
    );
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.nisn.trim() || !newStudent.name.trim() || !newStudent.pin.trim()) {
      setStudentFeedback({
        type: 'error',
        text: 'NISN, nama lengkap, dan PIN wajib diisi.',
      });
      return;
    }
    setSavingStudent(true);
    setStudentFeedback(null);
    const savedGrade = newStudent.gradeLevel;
    const className = `${newStudent.gradeLevel}-${newStudent.rombel}`;
    try {
      const res = await authFetch('/api/users/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingStudentId || undefined,
          nisn: newStudent.nisn.trim(),
          name: newStudent.name.trim(),
          className,
          pin: newStudent.pin.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStudentFeedback({
          type: 'error',
          text: data.error || `Gagal menyimpan peserta (HTTP ${res.status}).`,
        });
        return;
      }

      if (data.student) {
        setStudents((prev) => {
          const exists = prev.some(
            (s) => s.id === data.student.id || s.nisn === data.student.nisn
          );
          if (exists) {
            return prev.map((s) =>
              s.id === data.student.id || s.nisn === data.student.nisn ? data.student : s
            );
          }
          return [...prev, data.student];
        });
      }

      if (rombelFilter !== 'all' && rombelFilter.toLowerCase() !== savedGrade.toLowerCase()) {
        setRombelFilter(savedGrade);
      }

      setEditingStudentId(null);
      setNewStudent({
        nisn: '',
        name: '',
        gradeLevel: savedGrade,
        rombel: 'A',
        pin: '',
      });
      setStudentFeedback(
        data.storageWarning
          ? { type: 'warning', text: data.storageWarning }
          : {
              type: 'success',
              text: data.savedToSupabase
                ? `Peserta "${data.student?.name || ''}" berhasil disimpan ke database Supabase.`
                : `Peserta "${data.student?.name || ''}" berhasil disimpan.`,
            }
      );
      await refreshUsers();
    } catch {
      setStudentFeedback({
        type: 'error',
        text: 'Koneksi ke server terputus saat menyimpan peserta.',
      });
    } finally {
      setSavingStudent(false);
    }
  };

  const handleStartEditStudent = (st: StudentAccount) => {
    const match = st.className.match(/(Kelas\s*\d+)\s*[-–]?\s*(.*)/i);
    const gradeLevel = match ? match[1].replace(/\s+/g, ' ').trim() : 'Kelas 6';
    const rombelRaw = match && match[2] ? match[2].trim() : 'A';
    setEditingStudentId(st.id);
    setNewStudent({
      nisn: st.nisn,
      name: st.name,
      gradeLevel,
      rombel: rombelRaw || 'A',
      pin: st.pin,
    });
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.username.trim() || !newStaff.name.trim() || !newStaff.password.trim()) {
      setStaffFeedback({
        type: 'error',
        text: 'Username, nama lengkap, dan kata sandi wajib diisi.',
      });
      return;
    }
    setSavingStaff(true);
    setStaffFeedback(null);
    try {
      const res = await authFetch('/api/users/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStaffFeedback({
          type: 'error',
          text: data.error || `Gagal menyimpan akun staf (HTTP ${res.status}).`,
        });
        return;
      }
      setNewStaff({
        username: '',
        name: '',
        title: '',
        role: 'guru',
        subjectArea: '',
        password: '',
      });
      setStaffFeedback({
        type: 'success',
        text: `Akun "${data.staff?.name || ''}" berhasil disimpan.`,
      });
      await refreshUsers();
    } catch {
      setStaffFeedback({
        type: 'error',
        text: 'Koneksi ke server terputus saat menyimpan akun staf.',
      });
    } finally {
      setSavingStaff(false);
    }
  };

  const teacherList = staffList.filter((s) => s.role === 'guru');
  const selectedAssessmentObj =
    assessments.find((a) => a.id === selectedAsmForQuestions) || null;
  const canGuruEditSelected =
    isGuru &&
    Boolean(selectedAssessmentObj && selectedAssessmentObj.assignedTeacherId === user.id);

  const gradeLevels = ['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'];
  const filteredStudents = students
    .filter((st) =>
      rombelFilter === 'all'
        ? true
        : st.className.toLowerCase().startsWith(rombelFilter.toLowerCase())
    )
    .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));

  const avgScore =
    submissions.length > 0
      ? (submissions.reduce((acc, s) => acc + s.finalScore, 0) / submissions.length).toFixed(1)
      : '0.0';
  const passCount = submissions.filter((s) => s.finalScore >= 75).length;

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'overview', label: 'Ringkasan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'gradebook', label: 'Database Nilai Instan', icon: <BarChart3 className="w-4 h-4" /> },
    {
      id: 'assessments',
      label: isAdmin ? 'Penugasan & Jadwal Mapel' : 'Jadwal & Bank Soal',
      icon: <BookOpen className="w-4 h-4" />,
    },
    { id: 'anticheat', label: 'Pengawas Anti-Curang', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'drive', label: 'Google Drive & Media', icon: <FolderOpen className="w-4 h-4" /> },
    {
      id: 'users',
      label: 'Peserta Rombel & Staf',
      icon: <Users className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      id: 'appearance',
      label: 'Tampilan Halaman Awal',
      icon: <LayoutTemplate className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      id: 'integrations',
      label: 'Supabase & GAS',
      icon: <Database className="w-4 h-4" />,
      adminOnly: true,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-200">
          <p className="text-xs font-semibold text-emerald-700">
            {isAdmin ? 'Portal Administrator' : 'Portal Guru Pengampu'}
          </p>
          <h1 className="text-base font-bold text-slate-900 mt-1 tracking-tight">
            AISA · MI Ma&apos;arif Al Ihsan
          </h1>
          <p className="text-xs text-slate-500 mt-1 truncate">{user.name}</p>
        </div>

        <nav className="p-3 flex-1 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>

        <div className="p-4 border-t border-slate-200 hidden lg:block">
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-6">
          <p className="text-xs text-slate-500 truncate">
            CBT Madrasah · {user.title} · Basis Data:{' '}
            {integrationStatus?.supabaseConfigured ? 'Supabase Cloud' : 'Penyimpanan Lokal Persisten'}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="lg:hidden px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer"
          >
            Keluar
          </button>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Ringkasan Operasional Asesmen
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Pantau capaian nilai instan, jadwal asesmen aktif, dan kepatuhan anti-kecurangan.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Asesmen Aktif</p>
                  <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums mt-2">
                    {assessments.filter((a) => a.status === 'active').length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Total {assessments.length} paket asesmen
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Nilai Instan Masuk</p>
                  <p className="text-3xl font-bold text-emerald-700 font-mono tabular-nums mt-2">
                    {submissions.length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                    {passCount} siswa mencapai KKM (≥75)
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Rata-Rata Nilai Madrasah</p>
                  <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums mt-2">
                    {avgScore}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Skala penilaian otomatis 0–100</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Catatan Pelanggaran Keamanan</p>
                  <p className="text-3xl font-bold text-amber-700 font-mono tabular-nums mt-2">
                    {logs.length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Tercatat real-time oleh pengawas</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900">
                    Jadwal Penugasan &amp; Token Sesi Ujian Aktif
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('assessments')}
                    className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {isAdmin ? 'Atur Penugasan Mapel' : 'Lihat Jadwal & Soal Saya'}
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {assessments.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500">
                      {isGuru
                        ? 'Belum ada jadwal asesmen yang ditugaskan oleh Admin kepada Anda.'
                        : 'Belum ada jadwal asesmen yang terdaftar.'}
                    </p>
                  ) : (
                    assessments.map((asm) => {
                      const isActive = asm.status === 'active';
                      const isToggling = togglingAssessmentId === asm.id;
                      return (
                        <div
                          key={asm.id}
                          className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{asm.title}</p>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {isActive ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {asm.category} · {asm.gradeLevel} · Pengampu:{' '}
                              <span className="font-medium text-slate-700">
                                {asm.assignedTeacherName || 'Belum ditugaskan'}
                              </span>
                              {asm.scheduledDate ? ` · ${asm.scheduledDate}` : ''}
                              {asm.scheduleWindow ? ` (${asm.scheduleWindow})` : ''} ·{' '}
                              {asm.questionCount} Soal
                            </p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className="text-[11px] text-slate-500">Token Sesi</p>
                              <p className="text-sm font-bold font-mono tracking-wider text-emerald-700">
                                {asm.token}
                              </p>
                            </div>
                            <span className="text-xs font-mono tabular-nums text-slate-600">
                              {asm.submissionCount} peserta selesai
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={isToggling}
                                onClick={() => handleToggleAssessmentStatus(asm)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                                  isActive
                                    ? 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                                    : 'bg-emerald-700 border-emerald-700 text-white hover:bg-emerald-800'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>
                                  {isToggling
                                    ? 'Menyimpan...'
                                    : isActive
                                      ? 'Nonaktifkan'
                                      : 'Aktifkan'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DATABASE NILAI INSTAN */}
          {activeTab === 'gradebook' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    Database Nilai Instan
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Hasil penilaian otomatis Pilihan Ganda, PG Kompleks, dan Esai langsung tersimpan
                    dan siap dikalibrasi atau diekspor.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh CSV</span>
                  </button>
                  <button
                    type="button"
                    disabled={backingUpDrive}
                    onClick={handleBackupToDrive}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>
                      {backingUpDrive ? 'Mencadangkan...' : 'Backup ke Google Drive'}
                    </span>
                  </button>
                </div>
              </div>

              {backupFeedback && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                  {backupFeedback}
                </div>
              )}

              {gradebookFeedback && (
                <div
                  role="alert"
                  className={`p-3 rounded-lg border text-xs leading-relaxed ${
                    gradebookFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : gradebookFeedback.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {gradebookFeedback.text}
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={gradeSearch}
                    onChange={(e) => setGradeSearch(e.target.value)}
                    placeholder="Cari nama peserta, NISN, atau kelas..."
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <select
                  value={gradeAssessmentFilter}
                  onChange={(e) => setGradeAssessmentFilter(e.target.value)}
                  className="px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg min-w-[260px]"
                >
                  <option value="all">Semua Paket Asesmen</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Peserta &amp; NISN</th>
                      <th className="py-3 px-4">Kelas</th>
                      <th className="py-3 px-4">Paket Asesmen</th>
                      <th className="py-3 px-4 text-right">Keamanan</th>
                      <th className="py-3 px-4 text-right">Nilai</th>
                      <th className="py-3 px-4">Predikat</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredSubmissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 text-xs">{sub.studentName}</p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500">
                            {sub.studentNisn}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{sub.className}</td>
                        <td className="py-3 px-4 text-xs text-slate-700 max-w-xs truncate">
                          {sub.assessmentTitle}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-mono tabular-nums">
                          {sub.isLocked ? (
                            <span className="text-red-700 font-semibold">Terkunci ({sub.violationCount}x)</span>
                          ) : sub.violationCount > 0 ? (
                            <span className="text-amber-700 font-medium">{sub.violationCount}x Peringatan</span>
                          ) : (
                            <span className="text-emerald-700 font-medium">Bersih</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {sub.finalScore}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{sub.predicate}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => openCalibrationDrawer(sub)}
                              className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap cursor-pointer"
                            >
                              Rincian &amp; Kalibrasi
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGradebookFeedback(null);
                                setConfirmResetSub(sub);
                              }}
                              className="text-xs font-semibold text-amber-800 hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset / Remedial</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSubmissions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                          Tidak ada data nilai yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PENUGASAN MAPEL & BANK SOAL */}
          {activeTab === 'assessments' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {isAdmin
                      ? 'Penugasan Mapel & Jadwal Asesmen'
                      : 'Jadwal Penugasan & Bank Soal Guru'}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {isAdmin
                      ? 'Administrator mengatur paket asesmen, jenjang kelas (Kelas 1–6), jadwal sesi, dan menugaskan Guru Pengampu pembuat soal.'
                      : 'Guru Pengampu menyusun dan menyunting butir soal (PG, PGK MCMA, PGK Kategori, Isian Singkat, Uraian, Gambar & Video) khusus pada jadwal yang ditugaskan oleh Admin.'}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setAssessmentError(null);
                      setEditingAssessment(null);
                      setShowAssessmentModal(true);
                    }}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Buat Jadwal &amp; Penugasan</span>
                  </button>
                )}
              </div>

              {assessmentStatusFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs leading-relaxed ${
                    assessmentStatusFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : assessmentStatusFeedback.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {assessmentStatusFeedback.text}
                </div>
              )}

              {/* Assessment Cards List */}
              {assessments.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                  <p className="text-sm font-semibold text-slate-800">
                    {isGuru
                      ? 'Belum ada jadwal asesmen yang ditugaskan kepada Anda'
                      : 'Belum ada jadwal asesmen'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {isGuru
                      ? 'Jadwal mata pelajaran akan muncul di sini setelah Administrator menetapkan penugasan kepada Anda.'
                      : 'Klik "Buat Jadwal & Penugasan" untuk menambahkan paket asesmen dan menugaskan Guru Pengampu.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {assessments.map((asm) => {
                    const isSelected = selectedAsmForQuestions === asm.id;
                    const isActive = asm.status === 'active';
                    const isToggling = togglingAssessmentId === asm.id;
                    return (
                      <div
                        key={asm.id}
                        onClick={() => setSelectedAsmForQuestions(asm.id)}
                        className={`p-5 rounded-xl border transition-colors cursor-pointer bg-white flex flex-col justify-between ${
                          isSelected
                            ? 'border-emerald-700 ring-1 ring-emerald-700'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-medium text-slate-500">
                                {asm.gradeLevel}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {isActive ? 'Aktif · Terbit' : 'Nonaktif (Draft)'}
                              </span>
                            </div>
                            {isAdmin && (
                              <div
                                className="flex items-center gap-1 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssessmentError(null);
                                    setEditingAssessment(asm);
                                    setShowAssessmentModal(true);
                                  }}
                                  aria-label="Edit jadwal & penugasan"
                                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteAsm(asm)}
                                  aria-label="Hapus asesmen"
                                  className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 mt-1.5 line-clamp-2">
                            {asm.title}
                          </h3>
                          <p className="text-xs text-slate-600 mt-2">
                            Pengampu:{' '}
                            <span className="font-semibold text-slate-800">
                              {asm.assignedTeacherName || 'Belum ditugaskan'}
                            </span>
                          </p>
                          {(asm.scheduledDate || asm.scheduleWindow) && (
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                              {asm.scheduledDate || 'Jadwal fleksibel'}
                              {asm.scheduleWindow ? ` · ${asm.scheduleWindow}` : ''}
                            </p>
                          )}
                          {isGuru && (
                            <p className="text-[11px] font-semibold mt-1.5 text-emerald-700">
                              Jadwal Penugasan Saya (Dapat Buat Soal)
                            </p>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600">
                            <span>Token: {asm.token}</span>
                            <span>{asm.questionCount} soal</span>
                          </div>
                          {isAdmin && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={isToggling}
                                onClick={() => handleToggleAssessmentStatus(asm)}
                                className={`w-full py-1.5 px-3 text-xs font-semibold rounded-lg border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${
                                  isActive
                                    ? 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                                    : 'bg-emerald-700 border-emerald-700 text-white hover:bg-emerald-800'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>
                                  {isToggling
                                    ? 'Memperbarui Status...'
                                    : isActive
                                      ? 'Nonaktifkan Asesmen'
                                      : 'Aktifkan Asesmen'}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Questions for Selected Assessment */}
              {selectedAssessmentObj && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Daftar Butir Soal ({selectedAssessmentObj.title})
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pengampu terjadwal:{' '}
                        <span className="font-semibold text-slate-700">
                          {selectedAssessmentObj.assignedTeacherName || 'Belum ditugaskan'}
                        </span>
                        {selectedAssessmentObj.scheduledDate
                          ? ` · ${selectedAssessmentObj.scheduledDate}`
                          : ''}
                        {selectedAssessmentObj.scheduleWindow
                          ? ` (${selectedAssessmentObj.scheduleWindow})`
                          : ''}
                      </p>
                    </div>
                    {canGuruEditSelected && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setImportModalOpen(true)}
                          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <FileUp className="w-4 h-4 text-emerald-700" />
                          <span>Import Dokumen Soal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestion(null);
                            setQuestionEditorOpen(true);
                          }}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah Butir Soal</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                      Mode pantau Administrator: Admin mengatur penugasan mapel dan jadwal sesi;
                      pembuatan serta penyuntingan butir soal dikelola khusus oleh Guru Pengampu
                      yang ditugaskan ({selectedAssessmentObj.assignedTeacherName || 'Belum ada'}).
                    </div>
                  )}

                  {asmQuestions.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">
                      {canGuruEditSelected
                        ? 'Belum ada butir soal untuk asesmen ini. Klik "Tambah Butir Soal" untuk menyusun soal pertama.'
                        : 'Belum ada butir soal yang disusun oleh Guru Pengampu untuk jadwal ini.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {asmQuestions.map((q) => (
                        <div
                          key={q.id}
                          className="py-4 flex flex-col md:flex-row md:items-start justify-between gap-4"
                        >
                          <div className="flex items-start gap-4 max-w-3xl">
                            {q.imageUrl && (
                              <img
                                src={q.imageUrl}
                                alt={q.imageCaption || `Gambar soal ${q.orderNumber}`}
                                referrerPolicy="no-referrer"
                                className="h-16 w-24 object-cover rounded-lg border border-slate-200 bg-slate-50 shrink-0"
                              />
                            )}
                            <div className="space-y-1.5 min-w-0">
                              <p className="text-xs text-slate-500 font-mono tabular-nums">
                                No. {q.orderNumber} ·{' '}
                                {q.type === 'pg'
                                  ? 'Pilihan Ganda'
                                  : q.type === 'pgk'
                                    ? 'PG Kompleks (MCMA)'
                                    : q.type === 'pgk_kategori'
                                      ? `PGK Kategori (${(
                                          q.categoryLabels ||
                                          q.options?.find((o) => Array.isArray(o.categoryPair))
                                            ?.categoryPair || ['Sesuai', 'Tidak Sesuai']
                                        ).join(' / ')})`
                                      : q.type === 'isian'
                                        ? 'Isian Singkat'
                                        : 'Uraian'}{' '}
                                · {q.domain} · {q.cognitiveLevel} · {q.maxPoints} poin
                                {q.imageUrl ? ' · Lampiran Gambar' : ''}
                                {q.options?.some((o) => Boolean(o.imageUrl)) ? ' · Opsi Bergambar' : ''}
                                {q.videoUrl ? ' · Lampiran Video' : ''}
                              </p>
                              <p className="text-sm font-medium text-slate-900">{q.prompt}</p>
                              <p className="text-xs text-slate-500">
                                Penyusun: {q.authorName || selectedAssessmentObj.assignedTeacherName || 'Guru Pengampu'}
                              </p>
                              {q.type === 'pgk_kategori' && q.options.length > 0 && (
                                <p className="text-xs text-emerald-700 font-mono">
                                  {q.options.length} pernyataan kategori · Kunci:{' '}
                                  {q.options
                                    .map((opt, idx) => {
                                      const labels =
                                        q.categoryLabels ||
                                        q.options.find((o) => Array.isArray(o.categoryPair))
                                          ?.categoryPair || ['Sesuai', 'Tidak Sesuai'];
                                      const entry = (q.correctOptionIds || []).find((k) =>
                                        k.startsWith(`${opt.id}:`)
                                      );
                                      const side = entry?.split(':')[1] === 'B' ? labels[1] : labels[0];
                                      return `${idx + 1}:${side}`;
                                    })
                                    .join(', ')}
                                </p>
                              )}
                              {q.type === 'isian' && (
                                <p className="text-xs text-emerald-700 font-mono">
                                  Kunci isian singkat:{' '}
                                  {(q.essayKeywords && q.essayKeywords.length > 0
                                    ? q.essayKeywords.join(', ')
                                    : q.essaySampleAnswer) || '-'}
                                </p>
                              )}
                              {q.type === 'essay' && q.essayKeywords && q.essayKeywords.length > 0 && (
                                <p className="text-xs text-emerald-700 font-mono">
                                  Kata kunci rubrik: {q.essayKeywords.join(', ')}
                                </p>
                              )}
                            </div>
                          </div>

                          {canGuruEditSelected && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuestion(q);
                                  setQuestionEditorOpen(true);
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteQuestion(q)}
                                className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                              >
                                Hapus
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PENGAWAS ANTI-KECURANGAN */}
          {activeTab === 'anticheat' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Log Keamanan &amp; Pengawas Anti-Kecurangan
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Catatan otomatis saat peserta ujian berpindah tab, keluar layar penuh, atau
                  menekan pintasan terlarang.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Waktu Kejadian</th>
                      <th className="py-3 px-4">Peserta &amp; Kelas</th>
                      <th className="py-3 px-4">Asesmen</th>
                      <th className="py-3 px-4">Jenis Pelanggaran</th>
                      <th className="py-3 px-4">Keterangan</th>
                      <th className="py-3 px-4 text-right">Ke-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-semibold text-slate-900">{log.studentName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {log.studentNisn} · {log.className}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 max-w-xs truncate">
                          {log.assessmentTitle}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono font-semibold text-red-700">
                          {log.eventType}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{log.detail}</td>
                        <td className="py-3 px-4 text-right text-xs font-mono tabular-nums font-bold text-slate-900">
                          {log.violationNumber}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                          Belum ada catatan pelanggaran keamanan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: GOOGLE DRIVE & MEDIA */}
          {activeTab === 'drive' && (
            <DriveMediaManager
              assets={driveAssets}
              gasReachable={gasReachable}
              uploaderName={user.name}
              onRefresh={loadAllData}
            />
          )}

          {/* TAB 6: MANAJEMEN PENGGUNA (ADMIN ONLY) */}
          {activeTab === 'users' && isAdmin && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Manajemen Akun 3 Peran (Admin, Guru, Peserta Ujian)
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Kelola akun peserta ujian, guru pengampu, dan administrator proktor madrasah.
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setUserSubTab('students')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    userSubTab === 'students'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Peserta Ujian ({students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUserSubTab('staff')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    userSubTab === 'staff'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Guru &amp; Admin ({staffList.length})
                </button>
              </div>

              {userSubTab === 'students' ? (
                <div className="space-y-4">
                  {/* Rombel Kelas 1 s.d. Kelas 6 Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2">
                    <button
                      type="button"
                      onClick={() => setRombelFilter('all')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                        rombelFilter === 'all'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Semua Rombel ({students.length})
                    </button>
                    {gradeLevels.map((grade) => {
                      const count = students.filter((st) =>
                        st.className.toLowerCase().startsWith(grade.toLowerCase())
                      ).length;
                      return (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => {
                            setRombelFilter(grade);
                            if (!editingStudentId) {
                              setNewStudent((prev) => ({ ...prev, gradeLevel: grade }));
                            }
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors font-mono tabular-nums ${
                            rombelFilter === grade
                              ? 'bg-emerald-700 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {grade} ({count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <form
                      onSubmit={handleAddStudent}
                      className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          {editingStudentId ? 'Ubah Rombel & Data Peserta' : 'Tambah Peserta Ujian'}
                        </h3>
                        {editingStudentId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudentId(null);
                              setNewStudent({
                                nisn: '',
                                name: '',
                                gradeLevel: rombelFilter !== 'all' ? rombelFilter : 'Kelas 6',
                                rombel: 'A',
                                pin: '',
                              });
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Batal Edit
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">NISN</label>
                        <input
                          type="text"
                          required
                          value={newStudent.nisn}
                          onChange={(e) => setNewStudent({ ...newStudent, nisn: e.target.value })}
                          placeholder="Masukkan NISN peserta"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Nama Lengkap
                        </label>
                        <input
                          type="text"
                          required
                          value={newStudent.name}
                          onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                          placeholder="Nama lengkap siswa"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Tingkat Kelas
                          </label>
                          <select
                            value={newStudent.gradeLevel}
                            onChange={(e) =>
                              setNewStudent({ ...newStudent, gradeLevel: e.target.value })
                            }
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            {gradeLevels.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Rombel
                          </label>
                          <select
                            value={newStudent.rombel}
                            onChange={(e) =>
                              setNewStudent({ ...newStudent, rombel: e.target.value })
                            }
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="A">Rombel A</option>
                            <option value="B">Rombel B</option>
                            <option value="C">Rombel C</option>
                            <option value="Reguler">Reguler</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          PIN Login
                        </label>
                        <input
                          type="text"
                          required
                          value={newStudent.pin}
                          onChange={(e) => setNewStudent({ ...newStudent, pin: e.target.value })}
                          placeholder="Masukkan PIN peserta"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      {studentFeedback && (
                        <div
                          role="alert"
                          className={`p-2.5 rounded-lg border text-xs ${
                            studentFeedback.type === 'success'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : studentFeedback.type === 'warning'
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-red-50 border-red-200 text-red-900'
                          }`}
                        >
                          {studentFeedback.text}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={savingStudent}
                        className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        {savingStudent
                          ? 'Menyimpan...'
                          : editingStudentId
                            ? 'Simpan Perubahan Rombel'
                            : 'Simpan Akun Peserta'}
                      </button>
                    </form>

                    <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">NISN</th>
                            <th className="py-3 px-4">Nama Peserta</th>
                            <th className="py-3 px-4">Rombel Kelas</th>
                            <th className="py-3 px-4">PIN</th>
                            <th className="py-3 px-4 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {filteredStudents.map((st) => (
                            <tr key={st.id} className="hover:bg-slate-50/60">
                              <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                                {st.nisn}
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-900">{st.name}</td>
                              <td className="py-3 px-4 font-medium text-slate-700">
                                {st.className}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-600">{st.pin}</td>
                              <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditStudent(st)}
                                  className="text-emerald-700 hover:underline font-medium cursor-pointer"
                                >
                                  Atur Rombel
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeleteUser({
                                      kind: 'student',
                                      id: st.id,
                                      label: st.name,
                                    })
                                  }
                                  className="text-red-700 hover:underline font-medium cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filteredStudents.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500">
                                Belum ada peserta terdaftar pada rombel {rombelFilter}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <form
                    onSubmit={handleAddStaff}
                    className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <h3 className="text-sm font-bold text-slate-900">Tambah Akun Guru / Admin</h3>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Peran</label>
                      <select
                        value={newStaff.role}
                        onChange={(e) =>
                          setNewStaff({
                            ...newStaff,
                            role: e.target.value as 'guru' | 'admin',
                          })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="guru">Guru Pengampu</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Username / NIP
                      </label>
                      <input
                        type="text"
                        required
                        value={newStaff.username}
                        onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama &amp; Gelar
                      </label>
                      <input
                        type="text"
                        required
                        value={newStaff.name}
                        onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Jabatan / Mapel
                      </label>
                      <input
                        type="text"
                        value={newStaff.title}
                        onChange={(e) => setNewStaff({ ...newStaff, title: e.target.value })}
                        placeholder="Contoh: Guru Kelas IV"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Kata Sandi
                      </label>
                      <input
                        type="password"
                        required
                        value={newStaff.password}
                        onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    {staffFeedback && (
                      <div
                        role="alert"
                        className={`p-2.5 rounded-lg border text-xs ${
                          staffFeedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-red-50 border-red-200 text-red-900'
                        }`}
                      >
                        {staffFeedback.text}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={savingStaff}
                      className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      {savingStaff ? 'Menyimpan...' : 'Simpan Akun Staf'}
                    </button>
                  </form>

                  <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Nama Lengkap</th>
                          <th className="py-3 px-4">Peran</th>
                          <th className="py-3 px-4">Jabatan</th>
                          <th className="py-3 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {staffList.map((st) => (
                          <tr key={st.id}>
                            <td className="py-3 px-4 font-mono text-slate-700">{st.username}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{st.name}</td>
                            <td className="py-3 px-4 font-semibold text-emerald-700 uppercase">
                              {st.role}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{st.title}</td>
                            <td className="py-3 px-4 text-right">
                              {st.id !== user.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeleteUser({
                                      kind: 'staff',
                                      id: st.id,
                                      label: st.name,
                                    })
                                  }
                                  className="text-red-700 hover:underline font-medium cursor-pointer"
                                >
                                  Hapus
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: PENGATURAN HALAMAN AWAL (ADMIN ONLY) */}
          {activeTab === 'appearance' && isAdmin && siteSettings && (
            <LandingSettingsPanel
              settings={siteSettings}
              driveAssets={driveAssets}
              uploaderName={user.name}
              actorRole={user.role}
              actorId={user.id}
              onAssetUploaded={(asset) => setDriveAssets((prev) => [asset, ...prev])}
              onSaved={(updated) => {
                setSiteSettings(updated);
                onSiteSettingsUpdated?.(updated);
              }}
            />
          )}

          {/* TAB 8: INTEGRASI SUPABASE & GAS (ADMIN ONLY) */}
          {activeTab === 'integrations' && isAdmin && (
            <IntegrationConfigPanel
              status={integrationStatus}
              supabaseSql={supabaseSql}
              gasCode={gasCode}
              onStatusChange={(next) => setIntegrationStatus(next)}
            />
          )}
        </main>
      </div>

      {/* Assessment & Teacher Assignment Modal (Admin only) */}
      {isAdmin && showAssessmentModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingAssessment
                  ? 'Edit Jadwal & Penugasan Mapel'
                  : 'Buat Jadwal & Penugasan Mapel Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAssessmentModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {assessmentError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {assessmentError}
              </div>
            )}

            <form onSubmit={handleSaveAssessment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Asesmen *
                </label>
                <input
                  name="title"
                  required
                  defaultValue={editingAssessment?.title || ''}
                  placeholder="Contoh: Asesmen Sumatif Akhir Semester Matematika Kelas 6"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                  <select
                    name="category"
                    defaultValue={
                      editingAssessment?.category || 'Asesmen Sumatif Akhir Semester'
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Asesmen Sumatif Akhir Semester">
                      Asesmen Sumatif Akhir Semester
                    </option>
                    <option value="Asesmen Tengah Semester">Asesmen Tengah Semester</option>
                    <option value="Try Out AKM">Try Out AKM</option>
                    <option value="Asesmen Harian">Asesmen Harian</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mata Pelajaran / Fokus
                  </label>
                  <input
                    name="subject"
                    required
                    defaultValue={editingAssessment?.subject || ''}
                    placeholder="Contoh: Literasi & Numerasi"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Guru Pengampu yang Ditugaskan (Pembuat Soal) *
                  </label>
                  <select
                    name="assignedTeacherId"
                    required
                    defaultValue={editingAssessment?.assignedTeacherId || teacherList[0]?.id || ''}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {teacherList.length === 0 ? (
                      <option value="">Belum ada akun Guru terdaftar</option>
                    ) : (
                      teacherList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.subjectArea || t.title})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tanggal Jadwal Ujian
                    </label>
                    <input
                      type="date"
                      name="scheduledDate"
                      defaultValue={editingAssessment?.scheduledDate || new Date().toISOString().slice(0, 10)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Sesi Jam Pelaksanaan
                    </label>
                    <input
                      type="text"
                      name="scheduleWindow"
                      defaultValue={editingAssessment?.scheduleWindow || ''}
                      placeholder="07.30 - 09.00 WIB"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenjang Kelas
                  </label>
                  <select
                    name="gradeLevel"
                    defaultValue={editingAssessment?.gradeLevel || 'Kelas 6'}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {gradeLevels.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                    <option value="Semua Kelas">Semua Kelas (1–6)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
                  <input
                    name="semester"
                    defaultValue={editingAssessment?.semester || 'Gasal'}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tahun Pelajaran
                  </label>
                  <input
                    name="academicYear"
                    defaultValue={editingAssessment?.academicYear || '2026/2027'}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Token Sesi *
                  </label>
                  <input
                    name="token"
                    required
                    defaultValue={editingAssessment?.token || ''}
                    placeholder="Masukkan token"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Durasi (Menit)
                  </label>
                  <input
                    name="durationMinutes"
                    type="number"
                    min={5}
                    defaultValue={editingAssessment?.durationMinutes || 45}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Batas Pelanggaran
                  </label>
                  <input
                    name="maxViolations"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={editingAssessment?.maxViolations || 3}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingAssessment?.status || 'active'}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="active">Aktif (Terbit untuk Peserta)</option>
                    <option value="draft">Nonaktif / Draft (Disembunyikan)</option>
                  </select>
                </div>
                <div className="space-y-2 pt-4">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="shuffleQuestions"
                      defaultChecked={editingAssessment?.shuffleQuestions ?? false}
                      className="rounded border-slate-300 text-emerald-700"
                    />
                    <span>Acak urutan soal per peserta</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="showInstantResult"
                      defaultChecked={editingAssessment?.showInstantResult ?? true}
                      className="rounded border-slate-300 text-emerald-700"
                    />
                    <span>Tampilkan nilai instan ke siswa</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAssessmentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                >
                  Simpan Jadwal &amp; Penugasan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Question Editor Modal (Guru Pengampu assigned to schedule only) */}
      {canGuruEditSelected && questionEditorOpen && selectedAsmForQuestions && (
        <QuestionEditorModal
          assessmentId={selectedAsmForQuestions}
          initialQuestion={editingQuestion}
          nextOrderNumber={asmQuestions.length + 1}
          driveAssets={driveAssets}
          authorId={user.id}
          uploaderName={user.name}
          onAssetUploaded={(asset) => setDriveAssets((prev) => [asset, ...prev])}
          onSave={handleSaveQuestion}
          onClose={() => setQuestionEditorOpen(false)}
        />
      )}

      {/* Question Import Document Modal (Guru Pengampu assigned to schedule only) */}
      {canGuruEditSelected && importModalOpen && selectedAssessmentObj && (
        <QuestionImportModal
          assessmentId={selectedAssessmentObj.id}
          assessmentTitle={selectedAssessmentObj.title}
          actorId={user.id}
          actorRole={user.role}
          onImported={async (updatedQuestions, newAssets) => {
            setAsmQuestions(updatedQuestions);
            setAssessments((prev) =>
              prev.map((a) =>
                a.id === selectedAssessmentObj.id
                  ? { ...a, questionCount: updatedQuestions.length }
                  : a
              )
            );
            if (newAssets.length > 0) {
              setDriveAssets((prev) => [...newAssets, ...prev]);
            }
          }}
          onClose={() => setImportModalOpen(false)}
        />
      )}

      {/* Submission Detail & Essay Calibration Drawer */}
      {selectedSubmission && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl border-l border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  Detail Jawaban &amp; Kalibrasi Nilai Otomatis
                </p>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedSubmission.studentName} · {selectedSubmission.className}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Nilai Akhir Terhitung</p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-emerald-700">
                    {selectedSubmission.finalScore}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-800">
                    {selectedSubmission.predicate}
                  </p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    Pelanggaran: {selectedSubmission.violationCount}x
                  </p>
                </div>
              </div>

              {selectedSubmission.isLocked && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-4">
                  <p className="text-xs text-red-900">
                    Sesi peserta ini dikunci otomatis oleh sistem anti-kecurangan.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSaveCalibration(true)}
                    className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Buka Kunci Sesi</span>
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {loadingDrawerDetail ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Memuat rincian jawaban per butir soal...
                  </p>
                ) : selectedSubmission.gradedItems.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Belum ada rincian jawaban per butir soal pada rekaman ini.
                  </p>
                ) : (
                  selectedSubmission.gradedItems.map((item) => (
                    <div
                      key={item.questionId}
                      className="p-4 rounded-xl border border-slate-200 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-500">
                          Soal {item.orderNumber} ·{' '}
                          {item.type === 'pg'
                            ? 'PG'
                            : item.type === 'pgk'
                              ? 'PGK MCMA'
                              : item.type === 'pgk_kategori'
                                ? 'PGK Kategori'
                                : item.type === 'isian'
                                  ? 'Isian Singkat'
                                  : 'Uraian'}{' '}
                          · {item.domain}
                        </p>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-600">Skor:</label>
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={item.maxPoints}
                            value={calibratedScores[item.questionId] ?? item.earnedPoints}
                            onChange={(e) =>
                              setCalibratedScores((prev) => ({
                                ...prev,
                                [item.questionId]: Number(e.target.value),
                              }))
                            }
                            className="w-20 px-2 py-1 text-xs font-mono tabular-nums border border-slate-300 rounded-md text-right"
                          />
                          <span className="text-xs font-mono text-slate-500">
                            / {item.maxPoints}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{item.prompt}</p>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg">
                        <strong>Jawaban:</strong> {item.studentAnswerText}
                      </p>
                      <p className="text-xs text-slate-500">{item.feedback}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setGradebookFeedback(null);
                  setConfirmResetSub(selectedSubmission);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Ujian (Remedial)</span>
              </button>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Tutup
                </button>
                {selectedSubmission.gradedItems.length > 0 && (
                  <button
                    type="button"
                    disabled={savingCalibration}
                    onClick={() => handleSaveCalibration(false)}
                    className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                  >
                    {savingCalibration ? 'Menyimpan...' : 'Simpan Kalibrasi Nilai'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals (Zero window.confirm) */}
      {confirmResetSub && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Reset Ujian Peserta (Perbaikan / Remedial)?
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Hasil pengerjaan <strong>{confirmResetSub.studentName}</strong> (NISN{' '}
              <span className="font-mono">{confirmResetSub.studentNisn}</span>) pada{' '}
              <strong>{confirmResetSub.assessmentTitle}</strong> (Nilai:{' '}
              <strong className="font-mono">{confirmResetSub.finalScore}</strong>) akan direset agar
              peserta dapat masuk dan mengerjakan ujian lagi.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={resettingSubId === confirmResetSub.id}
                onClick={() => setConfirmResetSub(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={resettingSubId === confirmResetSub.id}
                onClick={handleConfirmResetSubmission}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {resettingSubId === confirmResetSub.id
                    ? 'Mereset...'
                    : 'Ya, Reset untuk Remedial'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteAsm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Hapus Paket Asesmen?</h3>
            <p className="text-sm text-slate-600 mt-2">
              Asesmen <strong>{confirmDeleteAsm.title}</strong> beserta seluruh soalnya akan
              dihapus permanen.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDeleteAsm(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  await authFetch(`/api/assessments/${confirmDeleteAsm.id}`, {
                    method: 'DELETE',
                  });
                  setConfirmDeleteAsm(null);
                  await refreshAssessments();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                Ya, Hapus Asesmen
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Hapus Butir Soal?</h3>
            <p className="text-sm text-slate-600 mt-2">
              Hapus Soal No. {confirmDeleteQuestion.orderNumber}? Tindakan ini tidak dapat
              dibatalkan.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDeleteQuestion(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  await authFetch(`/api/questions/${confirmDeleteQuestion.id}`, {
                    method: 'DELETE',
                  });
                  setConfirmDeleteQuestion(null);
                  if (selectedAsmForQuestions) {
                    const qRes = await authFetch(`/api/questions/${selectedAsmForQuestions}`);
                    const qJson = await qRes.json();
                    const nextQuestions: Question[] = qJson.questions || [];
                    setAsmQuestions(nextQuestions);
                    setAssessments((prev) =>
                      prev.map((a) =>
                        a.id === selectedAsmForQuestions
                          ? { ...a, questionCount: nextQuestions.length }
                          : a
                      )
                    );
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                Ya, Hapus Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Hapus Akun Pengguna?</h3>
            <p className="text-sm text-slate-600 mt-2">
              Akun <strong>{confirmDeleteUser.label}</strong> akan dihapus dari daftar akses CBT.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const url =
                    confirmDeleteUser.kind === 'student'
                      ? `/api/users/student/${confirmDeleteUser.id}`
                      : `/api/users/staff/${confirmDeleteUser.id}`;
                  await authFetch(url, { method: 'DELETE' });
                  setConfirmDeleteUser(null);
                  await refreshUsers();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                Ya, Hapus Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
