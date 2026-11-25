import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { ExamResultView } from './components/ExamResultView.tsx';
import { ExamRoom } from './components/ExamRoom.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import { setAuthToken } from './lib/authClient.ts';
import type {
  Assessment,
  SafeQuestion,
  SessionUser,
  SiteSettings,
  SubmissionRecord,
} from './types/cbt.ts';

type AppView = 'login' | 'student_home' | 'exam_room' | 'exam_result' | 'staff_dashboard';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState<AppView>('login');
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<SafeQuestion[]>([]);
  const [examStartedAt, setExamStartedAt] = useState<string>('');
  const [activeResult, setActiveResult] = useState<SubmissionRecord | null>(null);

  const fetchSiteSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSiteSettings(data.settings);
      }
    } catch {
      // Fall back to default built-in LoginPage branding
    }
  };

  useEffect(() => {
    fetchSiteSettings();
  }, []);

  useEffect(() => {
    if (siteSettings?.appName) {
      document.title = `${siteSettings.appName} Smart Assesment Platform`;
    }
  }, [siteSettings?.appName]);

  const handleLoginSuccess = (loggedInUser: SessionUser, token: string) => {
    setAuthToken(token);
    setUser(loggedInUser);
    if (loggedInUser.role === 'student') {
      setView('student_home');
    } else {
      setView('staff_dashboard');
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setActiveAssessment(null);
    setActiveQuestions([]);
    setActiveResult(null);
    setView('login');
    if (!siteSettings) {
      fetchSiteSettings();
    }
  };

  const handleStartExam = (
    assessment: Assessment,
    questions: SafeQuestion[],
    startedAt: string
  ) => {
    setActiveAssessment(assessment);
    setActiveQuestions(questions);
    setExamStartedAt(startedAt);
    setView('exam_room');
  };

  const handleExamSubmitted = (result: SubmissionRecord) => {
    setActiveResult(result);
    setActiveAssessment(null);
    setActiveQuestions([]);
    setView('exam_result');
  };

  const handleViewResult = (result: SubmissionRecord) => {
    setActiveResult(result);
    setView('exam_result');
  };

  if (!user || view === 'login') {
    return <LoginPage siteSettings={siteSettings} onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === 'staff_dashboard' && (user.role === 'admin' || user.role === 'guru')) {
    return (
      <AdminDashboard
        user={user}
        onLogout={handleLogout}
        onSiteSettingsUpdated={(updated) => setSiteSettings(updated)}
      />
    );
  }

  if (view === 'exam_room' && activeAssessment) {
    return (
      <ExamRoom
        user={user}
        assessment={activeAssessment}
        questions={activeQuestions}
        startedAt={examStartedAt}
        onSubmitted={handleExamSubmitted}
      />
    );
  }

  if (view === 'exam_result' && activeResult) {
    return (
      <ExamResultView
        submission={activeResult}
        onBack={() => {
          setActiveResult(null);
          setView('student_home');
        }}
      />
    );
  }

  return (
    <StudentDashboard
      user={user}
      siteSettings={siteSettings}
      onLogout={handleLogout}
      onStartExam={handleStartExam}
      onViewResult={handleViewResult}
    />
  );
}
