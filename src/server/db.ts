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
} from '../types/cbt.ts';

export interface DatabaseSchema {
  assessments: Assessment[];
  questions: Question[];
  students: StudentAccount[];
  admins: AdminAccount[];
  submissions: SubmissionRecord[];
  antiCheatLogs: AntiCheatLog[];
  driveAssets: DriveAsset[];
  siteSettings: SiteSettings;
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
  showQuickDemo: true,
  updatedAt: '2026-11-23T00:00:00.000Z',
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cbt_database.json');

function createInitialData(): DatabaseSchema {
  return {
    admins: [
      {
        id: 'adm-1',
        username: 'admin',
        name: 'H. Muhammad Ridwan, M.Pd.I',
        title: 'Administrator Utama & Kepala Proktor',
        role: 'admin',
        subjectArea: 'Manajemen Madrasah',
        password: 'admin2026',
      },
      {
        id: 'guru-1',
        username: 'guru',
        name: 'Ustadz Ahmad Fauzi, S.Pd.I',
        title: 'Guru Kelas VI & Pengampu Literasi-Numerasi',
        role: 'guru',
        subjectArea: 'Literasi & Numerasi',
        password: 'guru2026',
      },
      {
        id: 'guru-2',
        username: 'wali5',
        name: 'Ibu Siti Rohmah, S.Pd',
        title: 'Guru Kelas V-A',
        role: 'guru',
        subjectArea: 'PAI & IPAS',
        password: 'guru2026',
      },
    ],
    students: [
      {
        id: 'stu-1a-1',
        nisn: '0181001001',
        name: 'Ahmad Zaki Al-Fatih',
        className: 'Kelas 1-A',
        pin: '123456',
      },
      {
        id: 'stu-2a-1',
        nisn: '0172001001',
        name: 'Nadia Khairunnisa',
        className: 'Kelas 2-A',
        pin: '123456',
      },
      {
        id: 'stu-3a-1',
        nisn: '0163001001',
        name: 'Fajar Maulana Malik',
        className: 'Kelas 3-A',
        pin: '123456',
      },
      {
        id: 'stu-4a-1',
        nisn: '0154001001',
        name: 'Salma Azzahra Putri',
        className: 'Kelas 4-A',
        pin: '123456',
      },
      {
        id: 'stu-4',
        nisn: '0145120301',
        name: 'Zahra Maulida Husna',
        className: 'Kelas 5-A',
        pin: '123456',
      },
      {
        id: 'stu-1',
        nisn: '0134829101',
        name: 'Muhammad Rizqi Pratama',
        className: 'Kelas 6-A',
        pin: '123456',
      },
      {
        id: 'stu-2',
        nisn: '0134829102',
        name: 'Aisyah Putri Ramadhani',
        className: 'Kelas 6-A',
        pin: '123456',
      },
      {
        id: 'stu-3',
        nisn: '0134829103',
        name: 'Bagas Satria Nugroho',
        className: 'Kelas 6-B',
        pin: '123456',
      },
    ],
    assessments: [
      {
        id: 'asm-asas-6',
        title: 'Asesmen Sumatif Akhir Semester (ASAS) Gasal — Literasi & Numerasi',
        category: 'Asesmen Sumatif Akhir Semester',
        subject: 'Literasi & Numerasi Terpadu',
        gradeLevel: 'Kelas 6',
        semester: 'Gasal',
        academicYear: '2026/2027',
        token: 'IHSAN6',
        durationMinutes: 45,
        maxViolations: 3,
        shuffleQuestions: false,
        showInstantResult: true,
        status: 'active',
        assignedTeacherId: 'guru-1',
        assignedTeacherName: 'Ustadz Ahmad Fauzi, S.Pd.I',
        scheduledDate: '2026-12-07',
        scheduleWindow: '07.30 - 09.00 WIB',
        createdAt: '2026-11-10T07:00:00.000Z',
      },
      {
        id: 'asm-ats-pai',
        title: 'Asesmen Tengah Semester — Akidah Akhlak & Literasi Keislaman',
        category: 'Asesmen Tengah Semester',
        subject: 'Akidah Akhlak & Literasi',
        gradeLevel: 'Kelas 5',
        semester: 'Gasal',
        academicYear: '2026/2027',
        token: 'AKHLAK5',
        durationMinutes: 30,
        maxViolations: 3,
        shuffleQuestions: true,
        showInstantResult: true,
        status: 'active',
        assignedTeacherId: 'guru-2',
        assignedTeacherName: 'Ibu Siti Rohmah, S.Pd',
        scheduledDate: '2026-12-08',
        scheduleWindow: '09.30 - 11.00 WIB',
        createdAt: '2026-11-05T07:00:00.000Z',
      },
      {
        id: 'asm-akm-try',
        title: 'Try Out Asesmen Kompetensi Madrasah (AKM) — Paket Penalaran',
        category: 'Try Out AKM',
        subject: 'Literasi Sains & Numerasi',
        gradeLevel: 'Kelas 6',
        semester: 'Gasal',
        academicYear: '2026/2027',
        token: 'AKM2026',
        durationMinutes: 40,
        maxViolations: 3,
        shuffleQuestions: false,
        showInstantResult: true,
        status: 'active',
        assignedTeacherId: 'guru-1',
        assignedTeacherName: 'Ustadz Ahmad Fauzi, S.Pd.I',
        scheduledDate: '2026-12-10',
        scheduleWindow: '07.30 - 09.00 WIB',
        createdAt: '2026-11-02T07:00:00.000Z',
      },
    ],
    questions: [
      {
        id: 'q-asas-1',
        assessmentId: 'asm-asas-6',
        orderNumber: 1,
        type: 'pg',
        domain: 'Literasi Membaca',
        cognitiveLevel: 'L2 Penerapan',
        stimulusTitle: 'Pojok Baca Serambi Madrasah Soborejo',
        stimulusPassage:
          'Setiap pukul 06.45 WIB sebelum bel masuk berbunyi, siswa kelas VI MI Ma\'arif Al Ihsan Soborejo berkumpul di Pojok Baca Serambi. Di rak kayu jati sebelah jendela lengkung, tersedia buku fabel nusantara seperti Kancil dan Buaya, kisah teladan sahabat Nabi, serta buku pengetahuan desa.\n\nFatimah dan Rahma memilih dua buku berbeda setiap pekan. Setelah membaca selama lima belas menit, mereka bertukar ringkasan cerita menggunakan bahasa sendiri di kartu baca. Kebiasaan sederhana ini membuat kosakata dan pemahaman bacaan seluruh siswa meningkat pesat saat menghadapi soal cerita panjang.',
        imageUrl: '/src/assets/images/literacy_reading_stimulus_1794802018035.jpg',
        imageCaption: 'Ilustrasi kegiatan membaca berpasangan di sudut perpustakaan madrasah.',
        prompt:
          'Berdasarkan wacana di atas, apa tujuan utama kegiatan bertukar ringkasan cerita setelah membaca selama lima belas menit?',
        options: [
          {
            id: 'opt-1a',
            label: 'A',
            text: 'Menghafal seluruh halaman buku sebelum jam pelajaran dimulai.',
          },
          {
            id: 'opt-1b',
            label: 'B',
            text: 'Melatih pemahaman isi bacaan dan memperkaya kosakata dengan menceritakan ulang memakai bahasa sendiri.',
          },
          {
            id: 'opt-1c',
            label: 'C',
            text: 'Menggantikan tugas menulis esai yang diberikan oleh guru kelas.',
          },
          {
            id: 'opt-1d',
            label: 'D',
            text: 'Membatasi jumlah buku yang boleh dipinjam siswa setiap pekan.',
          },
        ],
        correctOptionId: 'opt-1b',
        maxPoints: 15,
      },
      {
        id: 'q-asas-2',
        assessmentId: 'asm-asas-6',
        orderNumber: 2,
        type: 'pgk',
        domain: 'Numerasi',
        cognitiveLevel: 'L2 Penerapan',
        stimulusTitle: 'Desain Gazebo Literasi & Bak Tanaman Madrasah',
        stimulusPassage:
          'Komite MI Ma\'arif Al Ihsan Soborejo merancang sebuah gazebo baca dari kayu berukuran alas persegi 3,0 m × 3,0 m dengan tinggi tiang sisi 2,2 m. Di samping gazebo terdapat bak tanaman berbentuk balok dengan panjang 1,2 m, lebar 0,6 m, dan tinggi 0,4 m yang akan diisi media tanam subur.',
        imageUrl: '/src/assets/images/numeracy_prism_diagram_1794802018092.jpg',
        imageCaption: 'Denah ukuran gazebo baca dan bak tanaman persegi panjang.',
        prompt:
          'Perhatikan ukuran pada gambar teknis di samping. Pilihlah DUA pernyataan yang BENAR mengenai luas dan volume konstruksi tersebut!',
        options: [
          {
            id: 'opt-2a',
            label: 'A',
            text: 'Luas lantai gazebo baca berbentuk persegi adalah 9,0 m².',
          },
          {
            id: 'opt-2b',
            label: 'B',
            text: 'Volume maksimal tanah yang dapat mengisi penuh bak tanaman adalah 0,288 m³ (setara 288 liter).',
          },
          {
            id: 'opt-2c',
            label: 'C',
            text: 'Luas alas bak tanaman berukuran 1,2 m × 0,6 m adalah 1,8 m².',
          },
          {
            id: 'opt-2d',
            label: 'D',
            text: 'Keliling alas lantai gazebo adalah 6,0 meter.',
          },
        ],
        correctOptionIds: ['opt-2a', 'opt-2b'],
        maxPoints: 20,
      },
      {
        id: 'q-asas-3',
        assessmentId: 'asm-asas-6',
        orderNumber: 3,
        type: 'pgk',
        domain: 'Literasi Sains',
        cognitiveLevel: 'L3 Penalaran',
        stimulusTitle: 'Rantai Makanan & Irigasi Sawah Terasering Soborejo',
        stimulusPassage:
          'Di perbukitan sekitar Desa Soborejo, para petani menanam padi dengan sistem terasering yang dialiri irigasi jernih. Di ekosistem sawah tersebut hidup tanaman padi, capung, katak sawah, burung bangau putih, dan mikroorganisme pengurai. Petani menjaga keseimbangan ekosistem dengan tidak menyemprotkan pestisida kimia secara berlebihan.',
        imageUrl: '/src/assets/images/science_paddy_ecosystem_1794802018119.jpg',
        imageCaption: 'Ekosistem sawah terasering dengan capung, katak, dan burung bangau.',
        videoUrl: '/media/stimulus_ekosistem_sawah.mp4',
        videoCaption: 'Video Pengamatan Ekosistem Sawah Terasering Soborejo (00:06)',
        prompt:
          'Amati gambar dan tayangan video ekosistem sawah di samping. Manakah pernyataan yang TEPAT mengenai peran makhluk hidup dan keseimbangan ekosistem sawah? (Pilih semua jawaban yang benar)',
        options: [
          {
            id: 'opt-3a',
            label: 'A',
            text: 'Tanaman padi berperan sebagai produsen karena menghasilkan makanan sendiri melalui fotosintesis.',
          },
          {
            id: 'opt-3b',
            label: 'B',
            text: 'Burung bangau putih yang memangsa katak menempati tingkat konsumen puncak dalam rantai makanan gambar tersebut.',
          },
          {
            id: 'opt-3c',
            label: 'C',
            text: 'Jika populasi katak menurun drastis akibat perburuan liar, populasi burung bangau akan langsung meningkat pesat.',
          },
          {
            id: 'opt-3d',
            label: 'D',
            text: 'Mengurangi pestisida berlebihan membantu menjaga kelestarian capung dan katak sebagai pengendali hama alami.',
          },
        ],
        correctOptionIds: ['opt-3a', 'opt-3b', 'opt-3d'],
        maxPoints: 20,
      },
      {
        id: 'q-asas-4',
        assessmentId: 'asm-asas-6',
        orderNumber: 4,
        type: 'pg',
        domain: 'Numerasi',
        cognitiveLevel: 'L2 Penerapan',
        stimulusTitle: 'Gerakan Infaq Jumat & Koperasi Siswa Al Ihsan',
        stimulusPassage:
          'Dalam program Jumat Berkah bulan November, siswa kelas VI mengumpulkan dana infaq untuk santunan anak yatim dan perbaikan mushala. Kelas VI-A yang berjumlah 24 siswa mengumpulkan rata-rata Rp5.000 per anak. Kelas VI-B yang berjumlah 26 siswa mengumpulkan total Rp130.000. Sebanyak 40% dari seluruh dana gabungan disalurkan untuk pembelian buku Iqra dan Al-Qur\'an baru.',
        prompt:
          'Berapakah jumlah dana yang disalurkan untuk pembelian buku Iqra dan Al-Qur\'an baru?',
        options: [
          { id: 'opt-4a', label: 'A', text: 'Rp90.000' },
          { id: 'opt-4b', label: 'B', text: 'Rp100.000' },
          { id: 'opt-4c', label: 'C', text: 'Rp125.000' },
          { id: 'opt-4d', label: 'D', text: 'Rp150.000' },
        ],
        correctOptionId: 'opt-4b',
        maxPoints: 15,
      },
      {
        id: 'q-asas-5',
        assessmentId: 'asm-asas-6',
        orderNumber: 5,
        type: 'essay',
        domain: 'Literasi Sains',
        cognitiveLevel: 'L3 Penalaran',
        stimulusTitle: 'Analisis Dampak Ekosistem Sawah (Stimulus Video)',
        stimulusPassage:
          'Perhatikan kembali tayangan video ekosistem sawah terasering di samping. Perairan sawah yang bersih mendukung kehidupan katak sawah dan capung, sedangkan burung bangau mencari makan di petak sawah tersebut.',
        videoUrl: '/media/stimulus_ekosistem_sawah.mp4',
        videoCaption: 'Video Stimulus: Amati interaksi antarorganisme di sawah terasering.',
        imageUrl: '/src/assets/images/science_paddy_ecosystem_1794802018119.jpg',
        imageCaption: 'Diagram rantai makanan sawah terasering.',
        prompt:
          'Jelaskan dengan bahasamu sendiri apa yang akan terjadi pada populasi serangga/capung dan burung bangau jika katak sawah habis ditangkap manusia, lalu sebutkan satu cara menjaga keseimbangan ekosistem sawah tersebut!',
        options: [],
        essayKeywords: [
          'serangga|capung|hama|wereng',
          'meningkat|bertambah|banyak|meledak',
          'bangau|burung',
          'berkurang|menurun|kelaparan|mati',
          'jaga|lestari|tidak menangkap|pestisida|keseimbangan|rantai makanan',
        ],
        essaySampleAnswer:
          'Jika katak habis ditangkap, populasi serangga/capung atau hama padi akan meningkat karena pemangsanya berkurang, sedangkan populasi burung bangau akan berkurang karena kehilangan sumber makanan. Cara menjaganya adalah melarang penangkapan katak liar dan mengurangi penggunaan pestisida kimia.',
        maxPoints: 15,
      },
      {
        id: 'q-asas-6',
        assessmentId: 'asm-asas-6',
        orderNumber: 6,
        type: 'essay',
        domain: 'Numerasi',
        cognitiveLevel: 'L3 Penalaran',
        stimulusTitle: 'Perhitungan Media Tanam Bak Kayu (Stimulus Video)',
        stimulusPassage:
          'Sekolah berencana menambah 2 buah bak tanaman baru dengan ukuran yang sama persis seperti pada tayangan video denah gazebo di samping (panjang 1,2 m, lebar 0,6 m, tinggi 0,4 m). Satu karung pupuk kompos berisi 24 liter.',
        videoUrl: '/media/stimulus_geometri_gazebo.mp4',
        videoCaption: 'Video Animasi Teknis Dimensi Bak Tanaman & Gazebo Baca (00:06)',
        prompt:
          'Hitunglah total volume media tanam (dalam liter) yang dibutuhkan untuk mengisi penuh 2 buah bak tanaman baru tersebut, dan tentukan berapa karung pupuk kompos yang diperlukan! Tuliskan langkah perhitungannya.',
        options: [],
        essayKeywords: [
          '0.288|0,288|288',
          '576',
          '24',
          'karung|liter',
        ],
        essaySampleAnswer:
          'Volume 1 bak = 1,2 × 0,6 × 0,4 = 0,288 m³ = 288 liter. Untuk 2 bak = 2 × 288 = 576 liter. Banyak karung = 576 : 24 = 24 karung kompos.',
        maxPoints: 15,
      },
      // Assessment 2 Questions
      {
        id: 'q-ats-1',
        assessmentId: 'asm-ats-pai',
        orderNumber: 1,
        type: 'pg',
        domain: 'PAI & Akhlak',
        cognitiveLevel: 'L1 Pemahaman',
        stimulusTitle: 'Kejujuran dalam Menuntut Ilmu',
        stimulusPassage:
          'Rasulullah SAW bersabda bahwa kejujuran membimbing kepada kebaikan, dan kebaikan mengantarkan ke surga. Saat mengerjakan ujian berbasis komputer (CBT) di madrasah, seorang siswa tetap menjaga integritas dengan tidak membuka catatan ataupun mencari jawaban di tab lain meskipun tidak diawasi langsung di sebelah kursinya.',
        prompt:
          'Perilaku siswa yang tidak menyontek dan tidak berpindah tab saat ujian mencerminkan sifat terpuji yaitu...',
        options: [
          { id: 'opt-a1a', label: 'A', text: 'Shiddiq (jujur) dan amanah' },
          { id: 'opt-a1b', label: 'B', text: 'Riya dan takabur' },
          { id: 'opt-a1c', label: 'C', text: 'Ghadab dan hasad' },
          { id: 'opt-a1d', label: 'D', text: 'Israf dan tabdzir' },
        ],
        correctOptionId: 'opt-a1a',
        maxPoints: 30,
      },
      {
        id: 'q-ats-2',
        assessmentId: 'asm-ats-pai',
        orderNumber: 2,
        type: 'pgk',
        domain: 'PAI & Akhlak',
        cognitiveLevel: 'L2 Penerapan',
        stimulusTitle: 'Adab Belajar di Lingkungan Madrasah',
        stimulusPassage:
          'Siswa MI Ma\'arif Al Ihsan Soborejo dibiasakan berdoa sebelum belajar, menjaga kebersihan kelas, serta menghormati guru dan teman sebaya.',
        imageUrl: '/src/assets/images/madrasah_campus_hero_1794802017792.jpg',
        imageCaption: 'Lingkungan belajar yang asri di MI Ma\'arif Al Ihsan Soborejo.',
        prompt: 'Pilihlah DUA perilaku yang mencerminkan adab terpuji siswa di madrasah!',
        options: [
          { id: 'opt-a2a', label: 'A', text: 'Mengucapkan salam dan mencium tangan guru saat bertemu di serambi.' },
          { id: 'opt-a2b', label: 'B', text: 'Menyela pembicaraan teman yang sedang mengemukakan pendapat.' },
          { id: 'opt-a2c', label: 'C', text: 'Merapikan sepatu di depan kelas dan menjaga kebersihan taman.' },
          { id: 'opt-a2d', label: 'D', text: 'Meniru jawaban teman saat mengerjakan ulangan harian.' },
        ],
        correctOptionIds: ['opt-a2a', 'opt-a2c'],
        maxPoints: 35,
      },
      {
        id: 'q-ats-3',
        assessmentId: 'asm-ats-pai',
        orderNumber: 3,
        type: 'essay',
        domain: 'PAI & Akhlak',
        cognitiveLevel: 'L3 Penalaran',
        stimulusTitle: 'Refleksi Kejujuran Digital',
        stimulusPassage:
          'Kemajuan teknologi membuat ujian sekolah dapat dilakukan melalui komputer atau tablet. Namun, nilai yang tinggi hanya akan membawa keberkahan apabila diraih dengan usaha sendiri yang jujur.',
        prompt:
          'Mengapa kejujuran saat mengikuti asesmen CBT lebih berharga daripada nilai tinggi hasil kecurangan? Jelaskan pendapatmu dalam 2-3 kalimat!',
        options: [],
        essayKeywords: ['jujur|kejujuran', 'berkah|ilmu|kemampuan', 'usaha|mandiri|allah|amanah'],
        essaySampleAnswer:
          'Kejujuran menunjukkan kemampuan diri yang sesungguhnya dan diridhai Allah SWT sehingga ilmu menjadi berkah. Nilai tinggi dari kecurangan tidak mencerminkan pemahaman nyata.',
        maxPoints: 35,
      },
      // Assessment 3 Questions
      {
        id: 'q-akm-1',
        assessmentId: 'asm-akm-try',
        orderNumber: 1,
        type: 'pg',
        domain: 'Numerasi',
        cognitiveLevel: 'L3 Penalaran',
        stimulusTitle: 'Debit Irigasi Terasering',
        stimulusPassage:
          'Saluran irigasi di Desa Soborejo mengalirkan air dengan debit 15 liter per detik untuk mengairi petak sawah terasering.',
        imageUrl: '/src/assets/images/science_paddy_ecosystem_1794802018119.jpg',
        imageCaption: 'Aliran irigasi sawah terasering.',
        prompt:
          'Berapa meter kubik (m³) volume air yang mengalir melalui saluran irigasi tersebut selama 10 menit?',
        options: [
          { id: 'opt-k1a', label: 'A', text: '0,9 m³' },
          { id: 'opt-k1b', label: 'B', text: '9,0 m³' },
          { id: 'opt-k1c', label: 'C', text: '90 m³' },
          { id: 'opt-k1d', label: 'D', text: '900 m³' },
        ],
        correctOptionId: 'opt-k1b',
        maxPoints: 50,
      },
      {
        id: 'q-akm-2',
        assessmentId: 'asm-akm-try',
        orderNumber: 2,
        type: 'essay',
        domain: 'Literasi Membaca',
        cognitiveLevel: 'L3 Penalaran',
        stimulusTitle: 'Manfaat Taman Baca Desa',
        stimulusPassage:
          'Taman baca yang dikelola bersama oleh madrasah dan masyarakat desa membantu anak-anak memiliki akses terhadap buku bermutu tanpa harus pergi jauh ke kota.',
        imageUrl: '/src/assets/images/literacy_reading_stimulus_1794802018035.jpg',
        imageCaption: 'Siswa membaca buku cerita di taman baca.',
        prompt:
          'Tuliskan dua manfaat keberadaan taman baca di lingkungan madrasah desa bagi siswa!',
        options: [],
        essayKeywords: ['baca|literasi|minat', 'ilmu|wawasan|kosakata|pengetahuan', 'dekat|akses|mudah'],
        essaySampleAnswer:
          'Meningkatkan minat baca dan wawasan siswa serta memudahkan akses buku bermutu di desa.',
        maxPoints: 50,
      },
    ],
    submissions: [
      {
        id: 'sub-seed-1',
        assessmentId: 'asm-asas-6',
        assessmentTitle: 'Asesmen Sumatif Akhir Semester (ASAS) Gasal — Literasi & Numerasi',
        studentId: 'stu-2',
        studentNisn: '0134829102',
        studentName: 'Aisyah Putri Ramadhani',
        className: 'Kelas VI-A',
        startedAt: '2026-11-12T01:00:00.000Z',
        submittedAt: '2026-11-12T01:31:24.000Z',
        durationSeconds: 1884,
        violationCount: 0,
        autoSubmittedBySecurity: false,
        isLocked: false,
        totalPointsEarned: 94.5,
        totalPointsMax: 100,
        finalScore: 94.5,
        predicate: 'Sangat Baik',
        domainBreakdown: [
          { domain: 'Literasi Membaca', earned: 15, max: 15, percentage: 100 },
          { domain: 'Numerasi', earned: 50, max: 50, percentage: 100 },
          { domain: 'Literasi Sains', earned: 29.5, max: 35, percentage: 84 },
        ],
        gradedItems: [
          {
            questionId: 'q-asas-1',
            orderNumber: 1,
            type: 'pg',
            domain: 'Literasi Membaca',
            prompt:
              'Berdasarkan wacana di atas, apa tujuan utama kegiatan bertukar ringkasan cerita setelah membaca selama lima belas menit?',
            studentAnswerText:
              'B. Melatih pemahaman isi bacaan dan memperkaya kosakata dengan menceritakan ulang memakai bahasa sendiri.',
            maxPoints: 15,
            earnedPoints: 15,
            status: 'correct',
            matchedKeywords: [],
            missedKeywords: [],
            feedback: 'Jawaban Pilihan Ganda tepat.',
          },
        ],
        syncedToSupabase: true,
        backedUpToDrive: true,
      },
      {
        id: 'sub-seed-2',
        assessmentId: 'asm-asas-6',
        assessmentTitle: 'Asesmen Sumatif Akhir Semester (ASAS) Gasal — Literasi & Numerasi',
        studentId: 'stu-3',
        studentNisn: '0134829103',
        studentName: 'Bagas Satria Nugroho',
        className: 'Kelas VI-B',
        startedAt: '2026-11-12T01:05:00.000Z',
        submittedAt: '2026-11-12T01:42:10.000Z',
        durationSeconds: 2230,
        violationCount: 1,
        autoSubmittedBySecurity: false,
        isLocked: false,
        totalPointsEarned: 81,
        totalPointsMax: 100,
        finalScore: 81,
        predicate: 'Baik',
        domainBreakdown: [
          { domain: 'Literasi Membaca', earned: 15, max: 15, percentage: 100 },
          { domain: 'Numerasi', earned: 36, max: 50, percentage: 72 },
          { domain: 'Literasi Sains', earned: 30, max: 35, percentage: 86 },
        ],
        gradedItems: [],
        syncedToSupabase: true,
        backedUpToDrive: false,
      },
    ],
    antiCheatLogs: [
      {
        id: 'log-seed-1',
        assessmentId: 'asm-asas-6',
        assessmentTitle: 'Asesmen Sumatif Akhir Semester (ASAS) Gasal — Literasi & Numerasi',
        studentId: 'stu-3',
        studentNisn: '0134829103',
        studentName: 'Bagas Satria Nugroho',
        className: 'Kelas VI-B',
        eventType: 'TAB_SWITCH',
        detail: 'Siswa sempat berpindah tab browser selama 4 detik lalu kembali ke ruang ujian.',
        violationNumber: 1,
        timestamp: '2026-11-12T01:18:45.000Z',
      },
    ],
    driveAssets: [
      {
        id: 'drv-1',
        name: 'literacy_reading_stimulus.jpg',
        mimeType: 'image/jpeg',
        mediaKind: 'image',
        sizeBytes: 412800,
        url: '/src/assets/images/literacy_reading_stimulus_1794802018035.jpg',
        source: 'local_madrasah',
        uploadedBy: 'Ustadz Ahmad Fauzi, S.Pd.I',
        createdAt: '2026-11-10T06:30:00.000Z',
      },
      {
        id: 'drv-2',
        name: 'numeracy_prism_diagram.jpg',
        mimeType: 'image/jpeg',
        mediaKind: 'image',
        sizeBytes: 389120,
        url: '/src/assets/images/numeracy_prism_diagram_1794802018092.jpg',
        source: 'local_madrasah',
        uploadedBy: 'Ustadz Ahmad Fauzi, S.Pd.I',
        createdAt: '2026-11-10T06:32:00.000Z',
      },
      {
        id: 'drv-3',
        name: 'science_paddy_ecosystem.jpg',
        mimeType: 'image/jpeg',
        mediaKind: 'image',
        sizeBytes: 445200,
        url: '/src/assets/images/science_paddy_ecosystem_1794802018119.jpg',
        source: 'local_madrasah',
        uploadedBy: 'Ustadz Ahmad Fauzi, S.Pd.I',
        createdAt: '2026-11-10T06:35:00.000Z',
      },
      {
        id: 'drv-4',
        name: 'stimulus_ekosistem_sawah.mp4',
        mimeType: 'video/mp4',
        mediaKind: 'video',
        sizeBytes: 1714176,
        url: '/media/stimulus_ekosistem_sawah.mp4',
        source: 'local_madrasah',
        uploadedBy: 'Ustadz Ahmad Fauzi, S.Pd.I',
        createdAt: '2026-11-10T06:40:00.000Z',
      },
      {
        id: 'drv-5',
        name: 'stimulus_geometri_gazebo.mp4',
        mimeType: 'video/mp4',
        mediaKind: 'video',
        sizeBytes: 954368,
        url: '/media/stimulus_geometri_gazebo.mp4',
        source: 'local_madrasah',
        uploadedBy: 'Ustadz Ahmad Fauzi, S.Pd.I',
        createdAt: '2026-11-10T06:42:00.000Z',
      },
    ],
    siteSettings: { ...DEFAULT_SITE_SETTINGS },
  };
}

function ensureLocalStore(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialData();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as DatabaseSchema;

  // Non-destructive backfill for assignment schedules, Kelas 1-6, and siteSettings
  let dirty = false;
  const seed = createInitialData();
  if (!parsed.siteSettings) {
    parsed.siteSettings = { ...DEFAULT_SITE_SETTINGS };
    dirty = true;
  } else {
    const ss = parsed.siteSettings;
    if (ss.appName === 'AISSA' || ss.appName === 'ASET') {
      ss.appName = DEFAULT_SITE_SETTINGS.appName;
      dirty = true;
    }
    if (
      ss.tagline &&
      (ss.tagline.includes('Al Ihsan Soborejo Smart Asessment') ||
        ss.tagline.includes('Al Ihsan Smart Evaluation & Test'))
    ) {
      ss.tagline = ss.tagline
        .replace('Al Ihsan Soborejo Smart Asessment', 'Al Ihsan Smart Asesment')
        .replace('Al Ihsan Smart Evaluation & Test', 'Al Ihsan Smart Asesment');
      dirty = true;
    }
    if (
      ss.eyebrowText &&
      (ss.eyebrowText.includes('Al Ihsan Soborejo Smart Asessment') ||
        ss.eyebrowText.includes('Al Ihsan Smart Evaluation & Test'))
    ) {
      ss.eyebrowText = ss.eyebrowText
        .replace('Al Ihsan Soborejo Smart Asessment', 'Al Ihsan Smart Asesment')
        .replace('Al Ihsan Smart Evaluation & Test', 'Al Ihsan Smart Asesment');
      dirty = true;
    }
    if (ss.heroSubtitle && (ss.heroSubtitle.includes('AISSA') || ss.heroSubtitle.includes('ASET'))) {
      ss.heroSubtitle = ss.heroSubtitle.replace(/AISSA|ASET/g, 'AISA');
      dirty = true;
    }
    if (
      ss.loginHeading &&
      (ss.loginHeading.includes('Al Ihsan Soborejo Smart Asessment') ||
        ss.loginHeading.includes('Al Ihsan Smart Evaluation & Test'))
    ) {
      ss.loginHeading = ss.loginHeading
        .replace('Al Ihsan Soborejo Smart Asessment', 'Al Ihsan Smart Asesment')
        .replace('Al Ihsan Smart Evaluation & Test', 'Al Ihsan Smart Asesment');
      dirty = true;
    }
    if (!ss.logoUrl || ss.logoUrl.includes('aset_madrasah_logo_')) {
      ss.logoUrl = DEFAULT_SITE_SETTINGS.logoUrl;
      dirty = true;
    }
  }
  for (const a of parsed.assessments) {
    if (!a.assignedTeacherId) {
      const match = seed.assessments.find((sa) => sa.id === a.id);
      a.assignedTeacherId = match?.assignedTeacherId || 'guru-1';
      a.assignedTeacherName = match?.assignedTeacherName || 'Ustadz Ahmad Fauzi, S.Pd.I';
      a.scheduledDate = match?.scheduledDate || '2026-12-07';
      a.scheduleWindow = match?.scheduleWindow || '07.30 - 09.00 WIB';
      if (a.gradeLevel === 'Kelas VI') a.gradeLevel = 'Kelas 6';
      if (a.gradeLevel === 'Kelas V & VI') a.gradeLevel = 'Kelas 5';
      dirty = true;
    }
  }
  for (const s of parsed.students) {
    if (s.className.startsWith('Kelas VI')) {
      s.className = s.className.replace('Kelas VI', 'Kelas 6');
      dirty = true;
    } else if (s.className.startsWith('Kelas V')) {
      s.className = s.className.replace('Kelas V', 'Kelas 5');
      dirty = true;
    }
  }
  for (const seedStudent of seed.students) {
    if (!parsed.students.some((s) => s.id === seedStudent.id)) {
      parsed.students.push(seedStudent);
      dirty = true;
    }
  }
  if (dirty) {
    saveLocalStore(parsed);
  }
  return parsed;
}

function saveLocalStore(data: DatabaseSchema) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
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
const DRIVE_ASSET_COLUMNS =
  'id,name,mime_type,media_kind,size_bytes,url,drive_file_id,source,uploaded_by,created_at';
const SITE_SETTINGS_COLUMNS =
  'id,app_name,school_name,tagline,eyebrow_text,hero_title,hero_subtitle,login_heading,logo_url,background_image_url,show_quick_demo,updated_at';

let supabaseClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

export function invalidateDbCache() {
  cachedDb = null;
  cachedDbAt = 0;
  cachedSettings = null;
  cachedSettingsAt = 0;
  hydratedSubmissionDetails.clear();
}

export function getIntegrationStatus(): IntegrationStatus {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const gasUrl = process.env.GAS_DRIVE_WEBAPP_URL || '';
  const gasFolder = process.env.GAS_DRIVE_FOLDER_ID || '';

  let host: string | null = null;
  if (supabaseUrl) {
    try {
      host = new URL(supabaseUrl).hostname;
    } catch {
      host = supabaseUrl;
    }
  }

  const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
  return {
    supabaseConfigured,
    supabaseProjectHost: host,
    gasDriveConfigured: Boolean(gasUrl),
    gasFolderId: gasFolder || null,
    storageMode: supabaseConfigured ? 'supabase' : 'local_persistent',
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
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    orderNumber: row.order_number,
    type: row.type,
    domain: row.domain,
    cognitiveLevel: row.cognitive_level,
    stimulusTitle: row.stimulus_title || undefined,
    stimulusPassage: row.stimulus_passage || undefined,
    imageUrl: row.image_url || undefined,
    imageCaption: row.image_caption || undefined,
    videoUrl: row.video_url || undefined,
    videoCaption: row.video_caption || undefined,
    prompt: row.prompt,
    options: row.options || [],
    correctOptionId: row.correct_option_id || undefined,
    correctOptionIds: row.correct_option_ids || [],
    essayKeywords: row.essay_keywords || [],
    essaySampleAnswer: row.essay_sample_answer || undefined,
    maxPoints: Number(row.max_points || 10),
    authorId: row.author_id || undefined,
    authorName: row.author_name || undefined,
  };
}

function mapQuestionToDb(q: Question) {
  return {
    id: q.id,
    assessment_id: q.assessmentId,
    order_number: q.orderNumber,
    type: q.type,
    domain: q.domain,
    cognitive_level: q.cognitiveLevel,
    stimulus_title: q.stimulusTitle || null,
    stimulus_passage: q.stimulusPassage || null,
    image_url: q.imageUrl || null,
    image_caption: q.imageCaption || null,
    video_url: q.videoUrl || null,
    video_caption: q.videoCaption || null,
    prompt: q.prompt,
    options: q.options || [],
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
      // Explicit column projections: omits heavy `graded_items` JSONB from list load & caps logs/assets
      const [asmRes, qRes, subRes, logRes, stuRes, drvRes] = await Promise.all([
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
      ]);

      if (asmRes.error || qRes.error || subRes.error) {
        cachedDb = local;
        cachedDbAt = Date.now();
        return local;
      }

      // Seed Supabase automatically if tables exist and are empty
      if ((asmRes.data || []).length === 0) {
        await Promise.all([
          sb.from('assessments').upsert(local.assessments.map(mapAssessmentToDb)),
          sb.from('questions').upsert(local.questions.map(mapQuestionToDb)),
          sb.from('students').upsert(
            local.students.map((st) => ({
              id: st.id,
              nisn: st.nisn,
              name: st.name,
              class_name: st.className,
              pin: st.pin,
            }))
          ),
          sb.from('submissions').upsert(local.submissions.map(mapSubmissionToDb)),
        ]);
        cachedDb = local;
        cachedDbAt = Date.now();
        return local;
      }

      const loaded: DatabaseSchema = {
        admins: local.admins,
        students:
          stuRes.data && stuRes.data.length > 0
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
        antiCheatLogs: (logRes.data || []).map((r: any) => ({
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
        })),
        driveAssets:
          drvRes.data && drvRes.data.length > 0
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

// Lightweight targeted auth lookup when cache is cold (1 row instead of 6 tables)
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
      if (!error && data) {
        if (data.pin === pin) {
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

// Targeted submission detail loader (fetches heavy `graded_items` only when opening transcript/drawer)
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

export async function upsertAssessment(assessment: Assessment): Promise<Assessment> {
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

  const sb = getSupabase();
  if (sb) {
    await sb.from('assessments').upsert(mapAssessmentToDb(assessment));
  }
  return assessment;
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
    await sb.from('questions').upsert(mapQuestionToDb(question));
  }
  return question;
}

// Single-request batch upsert for imported questions (eliminates N roundtrips)
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
    await sb.from('questions').upsert(questions.map(mapQuestionToDb));
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

export async function addStudent(student: StudentAccount): Promise<StudentAccount> {
  const dbData = ensureLocalStore();
  const idx = dbData.students.findIndex((s) => s.nisn === student.nisn || s.id === student.id);
  if (idx >= 0) dbData.students[idx] = student;
  else dbData.students.push(student);
  saveLocalStore(dbData);

  if (cachedDb) {
    const cIdx = cachedDb.students.findIndex((s) => s.nisn === student.nisn || s.id === student.id);
    if (cIdx >= 0) cachedDb.students[cIdx] = student;
    else cachedDb.students.push(student);
  }

  const sb = getSupabase();
  if (sb) {
    await sb.from('students').upsert({
      id: student.id,
      nisn: student.nisn,
      name: student.name,
      class_name: student.className,
      pin: student.pin,
    });
  }
  return student;
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
  const dbData = ensureLocalStore();
  const idx = dbData.admins.findIndex((a) => a.id === staff.id || a.username === staff.username);
  if (idx >= 0) dbData.admins[idx] = staff;
  else dbData.admins.push(staff);
  saveLocalStore(dbData);

  if (cachedDb) {
    const cIdx = cachedDb.admins.findIndex(
      (a) => a.id === staff.id || a.username === staff.username
    );
    if (cIdx >= 0) cachedDb.admins[cIdx] = staff;
    else cachedDb.admins.push(staff);
  }

  return staff;
}

export async function deleteStaffById(id: string): Promise<void> {
  const dbData = ensureLocalStore();
  dbData.admins = dbData.admins.filter((a) => a.id !== id);
  saveLocalStore(dbData);

  if (cachedDb) {
    cachedDb.admins = cachedDb.admins.filter((a) => a.id !== id);
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
          const rawAppName = data.app_name || DEFAULT_SITE_SETTINGS.appName;
          const rawLogo = data.logo_url || '';
          const resolved: SiteSettings = {
            appName:
              rawAppName === 'AISSA' || rawAppName === 'ASET'
                ? DEFAULT_SITE_SETTINGS.appName
                : rawAppName,
            schoolName: data.school_name || DEFAULT_SITE_SETTINGS.schoolName,
            tagline: (data.tagline || DEFAULT_SITE_SETTINGS.tagline)
              .replace('Al Ihsan Soborejo Smart Asessment', 'Al Ihsan Smart Asesment')
              .replace('Al Ihsan Smart Evaluation & Test', 'Al Ihsan Smart Asesment'),
            eyebrowText: (data.eyebrow_text || DEFAULT_SITE_SETTINGS.eyebrowText)
              .replace('Al Ihsan Soborejo Smart Asessment', 'Al Ihsan Smart Asesment')
              .replace('Al Ihsan Smart Evaluation & Test', 'Al Ihsan Smart Asesment'),
            heroTitle: data.hero_title || DEFAULT_SITE_SETTINGS.heroTitle,
            heroSubtitle: (data.hero_subtitle || DEFAULT_SITE_SETTINGS.heroSubtitle).replace(
              /AISSA|ASET/g,
              'AISA'
            ),
            loginHeading: (data.login_heading || DEFAULT_SITE_SETTINGS.loginHeading)
              .replace('Al Ihsan Soborejo Smart Asessment', 'Al Ihsan Smart Asesment')
              .replace('Al Ihsan Smart Evaluation & Test', 'Al Ihsan Smart Asesment'),
            logoUrl:
              !rawLogo || rawLogo.includes('aset_madrasah_logo_')
                ? DEFAULT_SITE_SETTINGS.logoUrl
                : rawLogo,
            backgroundImageUrl:
              data.background_image_url ?? DEFAULT_SITE_SETTINGS.backgroundImageUrl,
            showQuickDemo: data.show_quick_demo ?? true,
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
        show_quick_demo: merged.showQuickDemo,
        updated_at: merged.updatedAt,
      });
    } catch {
      // Keep local store updated even if site_settings table is not yet migrated in Supabase
    }
  }
  return merged;
}

