import React, { useState, useEffect } from "react";

// البيانات الافتراضية
const DEF_STUDENTS = [
  {
    id: 1,
    name: "سارة أحمد",
    major: "هندسة برمجيات",
    uni: "2021456",
    phone: "0501234567",
    email: "sara@univ.edu.sa",
    dept: "تقنية المعلومات",
    start: "2026-09-06",
    end: "2026-12-17",
    supervisor: "أ. نورة العتيبي",
    gpa: 4.62,
    hours: 112,
    courses: [
      { name: "برمجة 2", code: "CS201", term: "1445-1", grade: "A" },
      { name: "قواعد البيانات", code: "IS301", term: "1445-2", grade: "A+" },
      { name: "هندسة البرمجيات", code: "SE330", term: "1446-1", grade: "B+" },
    ],
  },
  {
    id: 2,
    name: "ريم خالد",
    major: "نظم معلومات إدارية",
    uni: "2021789",
    phone: "0559876543",
    email: "reem@univ.edu.sa",
    dept: "الموارد البشرية",
    start: "2026-09-06",
    end: "2026-12-17",
    supervisor: "أ. منى الزهراني",
    gpa: 4.35,
    hours: 118,
    courses: [
      { name: "تحليل النظم", code: "IS320", term: "1445-2", grade: "A" },
      { name: "إدارة المشاريع", code: "IS340", term: "1446-1", grade: "B+" },
    ],
  },
];

const DEF_CRIT = [
  { id: 1, name: "الالتزام بالحضور والمواعيد", desc: "الانضباط في الحضور والانصراف" },
  { id: 2, name: "جودة العمل المنجز", desc: "دقة المخرجات واتباع المعايير" },
  { id: 3, name: "المهارات التقنية", desc: "إتقان الأدوات والمهام المطلوبة" },
  { id: 4, name: "التواصل والعمل ضمن فريق", desc: "التعاون مع الزملاء والمشرفة" },
];

const COMPANY = "شركة المستقبل التقني";
const CAPACITY = 4;
const STORAGE_KEY = "trainingPortalIndexV1";

export default function TrainingPortal() {
  // حالة التطبيق
  const [data, setData] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return { students: DEF_STUDENTS, criteria: DEF_CRIT, evals: {}, reports: [] };
  });

  const [currentView, setCurrentView] = useState({ page: "home", studentId: null });

  // حفظ التغييرات في LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // حساب التقييم الشامل لمتدربة
  const calculateOverall = (studentId) => {
    const ev = data.evals[studentId];
    if (!ev || !ev.scores) return null;
    const scores = data.criteria
      .map((c) => ev.scores[c.id])
      .filter((v) => v !== undefined && v !== "");
    if (!scores.length) return null;
    const sum = scores.reduce((acc, curr) => acc + Number(curr), 0);
    return Math.round(sum / scores.length);
  };

  // التنقل بين الصفحات
  const renderView = () => {
    if (currentView.page === "criteria") {
      return <CriteriaView data={data} setData={setData} />;
    }
    if (currentView.page === "student" && currentView.studentId) {
      return (
        <StudentDetailsView
          studentId={currentView.studentId}
          data={data}
          setData={setData}
          calculateOverall={calculateOverall}
          onBack={() => setCurrentView({ page: "home", studentId: null })}
        />
      );
    }
    return (
      <HomeView
        data={data}
        setData={setData}
        calculateOverall={calculateOverall}
        onOpenStudent={(id) => setCurrentView({ page: "student", studentId: id })}
      />
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 text-gray-800 p-4 md:p-6 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* شريط التنقل */}
        <nav className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setCurrentView({ page: "home", studentId: null })}
            className={`px-4 py-2 rounded-lg font-bold text-sm shadow transition ${
              currentView.page === "home" ? "bg-blue-700 text-white" : "bg-white text-blue-700 hover:bg-gray-50"
            }`}
          >
            المتدربات
          </button>
          <button
            onClick={() => setCurrentView({ page: "criteria", studentId: null })}
            className={`px-4 py-2 rounded-lg font-bold text-sm shadow transition ${
              currentView.page === "criteria" ? "bg-blue-700 text-white" : "bg-white text-blue-700 hover:bg-gray-50"
            }`}
          >
            بنود التقييم
          </button>
          <a
            href="#logout"
            className="px-4 py-2 bg-white text-blue-700 rounded-lg font-bold text-sm shadow hover:bg-gray-50 transition"
          >
            خروج
          </a>
        </nav>

        {/* عرض الصفحة الحالية */}
        {renderView()}
      </div>
    </div>
  );
}

/* =========================================================
   1. الصفحة الرئيسية (قائمة المتدربات + إرسال التقارير)
   ========================================================= */
function HomeView({ data, setData, calculateOverall, onOpenStudent }) {
  const vacant = Math.max(CAPACITY - data.students.length, 0);

  // حالات النماذج
  const [newStudent, setNewStudent] = useState({ name: "", major: "", uni: "", phone: "", email: "", dept: "", supervisor: "" });
  const [report, setReport] = useState({ studentId: data.students[0]?.id || "", type: "إشعار غياب أو تقصير", details: "" });
  const [reportMsg, setReportMsg] = useState("");

  const handleAddStudent = (e) => {
    e.preventDefault();
    if (!newStudent.name.trim()) return;
    const newId = data.students.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const updated = [
      ...data.students,
      { ...newStudent, id: newId, start: "", end: "", gpa: 0, hours: 0, courses: [] },
    ];
    setData({ ...data, students: updated });
    setNewStudent({ name: "", major: "", uni: "", phone: "", email: "", dept: "", supervisor: "" });
  };

  const handleDeleteStudent = (id) => {
    if (!window.confirm("حذف المتدربة وكل بياناتها؟")) return;
    const updatedStudents = data.students.filter((s) => s.id !== id);
    const updatedEvals = { ...data.evals };
    delete updatedEvals[id];
    setData({ ...data, students: updatedStudents, evals: updatedEvals });
  };

  const handleSendReport = (e) => {
    e.preventDefault();
    if (!report.details.trim()) return;
    const st = data.students.find((s) => s.id === Number(report.studentId));
    const newReport = {
      student: st ? st.name : "—",
      type: report.type,
      details: report.details,
      date: new Date().toISOString(),
    };
    setData({ ...data, reports: [newReport, ...data.reports] });
    setReport({ ...report, details: "" });
    setReportMsg("تم تسجيل التقرير");
    setTimeout(() => setReportMsg(""), 3000);
  };

  return (
    <div className="space-y-6">
      {/* كروت الإحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-blue-700">
          <span className="text-xs text-gray-500 block">اسم المنشأة</span>
          <b className="text-lg text-gray-800">{COMPANY}</b>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-blue-700">
          <span className="text-xs text-gray-500 block">إجمالي المقاعد المتاحة</span>
          <b className="text-lg text-gray-800">{CAPACITY} مقاعد</b>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-blue-700">
          <span className="text-xs text-gray-500 block">المقاعد الشاغرة</span>
          <b className="text-lg text-gray-800">{vacant} مقعد شاغر</b>
        </div>
      </div>

      {/* الجدول الرئيسي */}
      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="text-blue-900 font-bold mb-4 text-lg">قائمة المتدربات والتقييم (من 100 درجة)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-b">
                <th className="p-3">اسم المتدربة</th>
                <th className="p-3">التخصص</th>
                <th className="p-3">ملف المتدربة</th>
                <th className="p-3">التقييم الشامل (من 100)</th>
                <th className="p-3">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.students.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center p-6 text-gray-500">
                    لا توجد متدربات. أضيفي متدربة من النموذج أدناه.
                  </td>
                </tr>
              ) : (
                data.students.map((s) => {
                  const overall = calculateOverall(s.id);
                  return (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3">{s.major}</td>
                      <td className="p-3">
                        <button
                          onClick={() => onOpenStudent(s.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold"
                        >
                          فتح الملف
                        </button>
                      </td>
                      <td className="p-3">
                        {overall === null ? (
                          <span className="text-gray-400">لم تُقيَّم</span>
                        ) : (
                          <span><b>{overall}</b> / 100</span>
                        )}
                      </td>
                      <td className="p-3 space-x-2 space-x-reverse">
                        <button
                          onClick={() => setReport({ ...report, studentId: s.id })}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-bold"
                        >
                          إثارة / شكوى
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(s.id)}
                          className="text-red-600 hover:text-red-800 font-bold text-xs p-1"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نموذج إضافة متدربة */}
      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="text-blue-900 font-bold mb-4 text-lg">إضافة متدربة</h3>
        <form onSubmit={handleAddStudent} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">الاسم</label>
              <input
                type="text"
                required
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">التخصص</label>
              <input
                type="text"
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.major}
                onChange={(e) => setNewStudent({ ...newStudent, major: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">الرقم الجامعي</label>
              <input
                type="text"
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.uni}
                onChange={(e) => setNewStudent({ ...newStudent, uni: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">الجوال</label>
              <input
                type="text"
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.phone}
                onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.email}
                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">القسم</label>
              <input
                type="text"
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.dept}
                onChange={(e) => setNewStudent({ ...newStudent, dept: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1">المشرفة المباشرة</label>
              <input
                type="text"
                className="w-full p-2 border rounded-md text-sm"
                value={newStudent.supervisor}
                onChange={(e) => setNewStudent({ ...newStudent, supervisor: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="bg-green-700 hover:bg-green-800 text-white font-bold px-4 py-2 rounded-md text-sm">
            إضافة المتدربة
          </button>
        </form>
      </div>

      {/* نموذج التقارير */}
      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="text-blue-900 font-bold mb-4 text-lg">نموذج الزيارة الميدانية وإرسال التقارير للجامعة</h3>
        <form onSubmit={handleSendReport} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1">اختر المتدربة:</label>
            <select
              className="w-full p-2 border rounded-md text-sm"
              value={report.studentId}
              onChange={(e) => setReport({ ...report, studentId: e.target.value })}
            >
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">نوع التقرير / الملاحظة:</label>
            <select
              className="w-full p-2 border rounded-md text-sm"
              value={report.type}
              onChange={(e) => setReport({ ...report, type: e.target.value })}
            >
              <option>إشعار غياب أو تقصير</option>
              <option>ملاحظة إيجابية</option>
              <option>شكوى</option>
              <option>تقرير زيارة ميدانية</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">تفاصيل الملاحظات أو الشكوى:</label>
            <textarea
              rows="4"
              className="w-full p-2 border rounded-md text-sm"
              placeholder="اكتبي تفاصيل التقرير أو الملاحظات هنا..."
              value={report.details}
              onChange={(e) => setReport({ ...report, details: e.target.value })}
            ></textarea>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-md text-sm">
              إرسال التقرير للجامعة
            </button>
            {reportMsg && <span className="text-green-700 font-bold text-sm">{reportMsg}</span>}
          </div>
        </form>

        {/* عرض التقارير المرسلة */}
        {data.reports.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <b className="text-sm block mb-3">التقارير المرسلة</b>
            <div className="space-y-3">
              {data.reports.map((r, idx) => (
                <div key={idx} className="border-b pb-2 text-sm">
                  <b>{r.student}</b> — {r.type}{" "}
                  <small className="text-gray-500">
                    ({new Date(r.date).toLocaleDateString("ar-SA")})
                  </small>
                  <p className="text-gray-700 mt-1">{r.details}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   2. صفحة تفاصيل المتدربة (السجل الأكاديمي والتقييم)
   ========================================================= */
function StudentDetailsView({ studentId, data, setData, calculateOverall, onBack }) {
  const student = data.students.find((s) => s.id === Number(studentId));
  if (!student) return <div className="p-6 text-center text-gray-500">لم يتم العثور على المتدربة.</div>;

  const currentEval = data.evals[student.id] || { scores: {}, notes: "" };

  // حالات النماذج المحلية
  const [newCourse, setNewCourse] = useState({ name: "", code: "", term: "", grade: "" });
  const [gpa, setGpa] = useState(student.gpa);
  const [hours, setHours] = useState(student.hours);
  const [evalScores, setEvalScores] = useState(currentEval.scores || {});
  const [evalNotes, setEvalNotes] = useState(currentEval.notes || "");
  const [saveMsg, setSaveMsg] = useState("");

  const overall = calculateOverall(student.id);

  const handleScoreChange = (critId, val) => {
    const num = val === "" ? undefined : Math.max(0, Math.min(100, Number(val)));
    const updatedScores = { ...evalScores };
    if (num === undefined) delete updatedScores[critId];
    else updatedScores[critId] = num;

    setEvalScores(updatedScores);
    
    // تحديث الحالة الفورية للـ App
    const updatedEvals = {
      ...data.evals,
      [student.id]: { scores: updatedScores, notes: evalNotes },
    };
    setData({ ...data, evals: updatedEvals });
  };

  const handleSaveEval = () => {
    const updatedEvals = {
      ...data.evals,
      [student.id]: { scores: evalScores, notes: evalNotes },
    };
    setData({ ...data, evals: updatedEvals });
    setSaveMsg("تم حفظ الدرجة");
    setTimeout(() => setSaveMsg(""), 2500);
  };

  const handleAddCourse = (e) => {
    e.preventDefault();
    if (!newCourse.name.trim()) return;
    const updatedCourses = [...student.courses, newCourse];
    updateStudentData({ courses: updatedCourses });
    setNewCourse({ name: "", code: "", term: "", grade: "" });
  };

  const handleDeleteCourse = (index) => {
    const updatedCourses = student.courses.filter((_, i) => i !== index);
    updateStudentData({ courses: updatedCourses });
  };

  const handleSaveGpaHours = () => {
    updateStudentData({ gpa: Number(gpa) || 0, hours: Number(hours) || 0 });
  };

  const updateStudentData = (fields) => {
    const updatedStudents = data.students.map((s) => (s.id === student.id ? { ...s, ...fields } : s));
    setData({ ...data, students: updatedStudents });
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-blue-600 hover:underline font-bold text-sm block">
        ‹ العودة لقائمة المتدربات
      </button>

      {/* الهيدر الرئيسي */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-6 rounded-xl shadow">
        <h2 className="text-2xl font-bold">{student.name}</h2>
        <p className="text-blue-100 text-sm">{student.major}</p>
      </div>

      {/* البيانات الشخصية */}
      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="text-blue-900 font-bold mb-4 text-lg">البيانات الشخصية والتدريب</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500 block text-xs">الرقم الجامعي</span><b>{student.uni || "—"}</b></div>
          <div><span className="text-gray-500 block text-xs">التخصص</span><b>{student.major || "—"}</b></div>
          <div><span className="text-gray-500 block text-xs">الجوال</span><b>{student.phone || "—"}</b></div>
          <div><span className="text-gray-500 block text-xs">البريد الإلكتروني</span><b>{student.email || "—"}</b></div>
          <div><span className="text-gray-500 block text-xs">القسم</span><b>{student.dept || "—"}</b></div>
          <div><span className="text-gray-500 block text-xs">المشرفة المباشرة</span><b>{student.supervisor || "—"}</b></div>
        </div>
      </div>

      {/* السجل الأكاديمي */}
      <div className="bg-white p-5 rounded-xl shadow space-y-4">
        <h3 className="text-blue-900 font-bold text-lg">السجل الأكاديمي</h3>
        <div className="grid grid-cols-3 gap-2 bg-gray-100 p-3 rounded-lg text-center">
          <div>
            <b className="text-blue-600 text-xl block">{Number(student.gpa).toFixed(2)}</b>
            <span className="text-xs text-gray-500">المعدل التراكمي من 5</span>
          </div>
          <div>
            <b className="text-blue-600 text-xl block">{student.hours}</b>
            <span className="text-xs text-gray-500">الساعات المنجزة</span>
          </div>
          <div>
            <b className="text-blue-600 text-xl block">{student.courses.length}</b>
            <span className="text-xs text-gray-500">مقررات</span>
          </div>
        </div>

        {/* جدول المقررات */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-2">المقرر</th>
                <th className="p-2">الرمز</th>
                <th className="p-2">الفصل</th>
                <th className="p-2">التقدير</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {student.courses.length === 0 ? (
                <tr><td colSpan="5" className="text-center p-4 text-gray-400">لا توجد مقررات مسجلة.</td></tr>
              ) : (
                student.courses.map((c, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{c.name}</td>
                    <td className="p-2">{c.code}</td>
                    <td className="p-2">{c.term}</td>
                    <td className="p-2">{c.grade}</td>
                    <td className="p-2">
                      <button onClick={() => handleDeleteCourse(i)} className="text-red-600 font-bold text-xs">
                        حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* إضافة مقرر */}
        <form onSubmit={handleAddCourse} className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
          <input
            placeholder="اسم المقرر"
            className="p-2 border rounded-md text-sm"
            value={newCourse.name}
            onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
          />
          <input
            placeholder="الرمز"
            className="p-2 border rounded-md text-sm"
            value={newCourse.code}
            onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
          />
          <input
            placeholder="الفصل (مثال 1446-1)"
            className="p-2 border rounded-md text-sm"
            value={newCourse.term}
            onChange={(e) => setNewCourse({ ...newCourse, term: e.target.value })}
          />
          <input
            placeholder="التقدير"
            className="p-2 border rounded-md text-sm"
            value={newCourse.grade}
            onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })}
          />
          <button type="submit" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-3 py-1.5 rounded-md text-xs col-span-2 md:col-span-1 mt-2">
            إضافة مقرر
          </button>
        </form>

        {/* معدل وساعات */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
          <div>
            <label className="block text-xs font-bold mb-1">المعدل التراكمي (من 5)</label>
            <input
              type="number"
              step="0.01"
              className="w-full p-2 border rounded-md text-sm"
              value={gpa}
              onChange={(e) => setGpa(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">الساعات المنجزة</label>
            <input
              type="number"
              className="w-full p-2 border rounded-md text-sm"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
        </div>
        <button onClick={handleSaveGpaHours} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-4 py-2 rounded-md text-xs">
          حفظ المعدل والساعات
        </button>
      </div>

      {/* تقييم المتدربة */}
      <div className="bg-white p-5 rounded-xl shadow space-y-4">
        <h3 className="text-blue-900 font-bold text-lg">تقييم المتدربة (من 100 درجة)</h3>
        {data.criteria.length === 0 ? (
          <div className="text-gray-400">لا توجد بنود تقييم. أضيفي بنوداً من صفحة «بنود التقييم».</div>
        ) : (
          data.criteria.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b pb-3 gap-4">
              <div>
                <b className="text-sm block">{c.name}</b>
                <small className="text-gray-500">{c.desc || "بدون وصف"}</small>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0-100"
                className="w-20 p-2 border rounded-md text-center text-sm"
                value={evalScores[c.id] !== undefined ? evalScores[c.id] : ""}
                onChange={(e) => handleScoreChange(c.id, e.target.value)}
              />
            </div>
          ))
        )}

        {/* نتيجة التقييم الشامل */}
        <div className="bg-gray-100 p-4 rounded-lg flex justify-between items-center">
          <span>التقييم الشامل (المتوسط)</span>
          <b>{overall === null ? "أدخلي درجة لكل بند" : `${overall} / 100`}</b>
        </div>

        {/* ملاحظات */}
        <div>
          <label className="block text-xs font-bold mb-1">ملاحظات المشرفة</label>
          <textarea
            rows="3"
            className="w-full p-2 border rounded-md text-sm"
            value={evalNotes}
            onChange={(e) => setEvalNotes(e.target.value)}
          ></textarea>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSaveEval} className="bg-green-700 hover:bg-green-800 text-white font-bold px-4 py-2 rounded-md text-sm">
            حفظ التقييم
          </button>
          {saveMsg && <span className="text-green-700 font-bold text-sm">{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   3. صفحة إدارة بنود التقييم
   ========================================================= */
function CriteriaView({ data, setData }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleAddCriteria = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const newId = data.criteria.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    const updated = [...data.criteria, { id: newId, name, desc }];
    setData({ ...data, criteria: updated });
    setName("");
    setDesc("");
  };

  const handleDeleteCriteria = (id) => {
    if (!window.confirm("حذف البند من جميع التقييمات؟")) return;
    const updatedCrit = data.criteria.filter((c) => c.id !== id);
    
    // مسح الدرجة المرتبطة من التقييمات الحالية
    const updatedEvals = { ...data.evals };
    Object.keys(updatedEvals).forEach((key) => {
      if (updatedEvals[key]?.scores) {
        delete updatedEvals[key].scores[id];
      }
    });

    setData({ ...data, criteria: updatedCrit, evals: updatedEvals });
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow space-y-4">
      <h3 className="text-blue-900 font-bold text-lg">بنود التقييم</h3>

      {data.criteria.length === 0 ? (
        <div className="text-gray-400 text-center p-4">لا توجد بنود. أضيفي أول بند.</div>
      ) : (
        <div className="space-y-3">
          {data.criteria.map((c) => (
            <div key={c.id} className="flex justify-between items-center border-b pb-2">
              <div>
                <b className="text-sm block">{c.name}</b>
                <small className="text-gray-500">{c.desc || "بدون وصف"}</small>
              </div>
              <button
                onClick={() => handleDeleteCriteria(c.id)}
                className="text-red-600 font-bold text-xs hover:underline"
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      )}

      {/* نموذج إضافة بند جديد */}
      <form onSubmit={handleAddCriteria} className="space-y-3 pt-4 border-t">
        <div>
          <input
            placeholder="اسم البند"
            required
            className="w-full p-2 border rounded-md text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <input
            placeholder="وصف مختصر (اختياري)"
            className="w-full p-2 border rounded-md text-sm"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-green-700 hover:bg-green-800 text-white font-bold px-4 py-2 rounded-md text-sm">
          إضافة البند
        </button>
      </form>
      <p className="text-xs text-gray-500">أي بند تضيفينه يظهر تلقائياً في ملف كل متدربة.</p>
    </div>
  );
}