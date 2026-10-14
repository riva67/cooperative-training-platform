import React, { useState, useEffect } from 'react';

// البيانات النموذجية للطالبات والدرجات (Mock Data)
const INITIAL_STUDENTS = [
  {
    id: 1,
    name: "سارة أحمد الغامدي",
    universityId: "441002341",
    major: "تطوير الويب",
    scores: { c1: 18, c2: 27, c3: 19, c4: 13, c5: 14 },
    notes: "طالبة متميزة وتلتزم بالوقت دائماً."
  },
  {
    id: 2,
    name: "ريم علي الشهري",
    universityId: "441005892",
    major: "أمن سيبراني",
    scores: { c1: 20, c2: 29, c3: 20, c4: 15, c5: 15 },
    notes: "أداء استثنائي في جميع المهام الموكلة لها."
  }
];

export default function EvaluationForm() {
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [currentStudentId, setCurrentStudentId] = useState(null);

  // حالات إدخال النموذج للطالبة المحددة
  const [scores, setScores] = useState({ c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 });
  const [notes, setNotes] = useState('');

  // تحديد الطالبة الأولى تلقائياً عند تحميل المكون
  useEffect(() => {
    if (students.length > 0) {
      selectStudent(students[0].id);
    }
  }, []);

  // حساب مجموع درجات طالبة
  const calculateStudentTotal = (studentScores) => {
    return (
      (Number(studentScores.c1) || 0) +
      (Number(studentScores.c2) || 0) +
      (Number(studentScores.c3) || 0) +
      (Number(studentScores.c4) || 0) +
      (Number(studentScores.c5) || 0)
    );
  };

  // اختيار طالبة وعرض بنود تقييمها
  const selectStudent = (id) => {
    setCurrentStudentId(id);
    const student = students.find((s) => s.id === id);
    if (student) {
      setScores({ ...student.scores });
      setNotes(student.notes || '');
    }
  };

  // المجموع الحالي التفاعلي
  const currentTotal = calculateStudentTotal(scores);

  // تحديث القيم عند الإدخال في الحقول
  const handleScoreChange = (field, value) => {
    setScores((prev) => ({
      ...prev,
      [field]: value === '' ? '' : Number(value)
    }));
  };

  // حفظ التقييم
  const saveEvaluation = (e) => {
    e.preventDefault();
    if (!currentStudentId) {
      alert('الرجاء اختيار طالبة أولاً.');
      return;
    }

    const updatedStudents = students.map((student) => {
      if (student.id === currentStudentId) {
        return {
          ...student,
          scores: {
            c1: Number(scores.c1) || 0,
            c2: Number(scores.c2) || 0,
            c3: Number(scores.c3) || 0,
            c4: Number(scores.c4) || 0,
            c5: Number(scores.c5) || 0
          },
          notes: notes
        };
      }
      return student;
    });

    setStudents(updatedStudents);
    const currentStudent = students.find((s) => s.id === currentStudentId);
    alert(`تم حفظ تقييم الطالبة (${currentStudent?.name}) بنجاح!`);
  };

  const selectedStudent = students.find((s) => s.id === currentStudentId);

  return (
    <div dir="rtl" className="bg-gray-50 min-h-screen p-6 font-sans">
      <div id="evaluations-page" className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-r-4 border-indigo-600 pr-3">
          نموذج التقييم النهائي للطالبات (من 100 درجة)
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* العرض الخارجي: قائمة الطالبات والنسب الكلية فقط */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 h-fit">
            <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex justify-between items-center">
              <span>
                <i className="fa-solid fa-users text-indigo-500 ml-2"></i>قائمة المتدربات
              </span>
              <span className="text-xs font-normal text-gray-500">النسبة الخارجية</span>
            </h3>

            <div id="students-external-list" className="space-y-3">
              {students.map((student) => {
                const total = calculateStudentTotal(student.scores);
                const isSelected = student.id === currentStudentId;

                return (
                  <div
                    key={student.id}
                    onClick={() => selectStudent(student.id)}
                    className={`p-3.5 rounded-lg border cursor-pointer transition flex justify-between items-center ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{student.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{student.major}</p>
                    </div>
                    <div className="text-left">
                      <span
                        className={`font-bold text-base ${
                          total >= 90 ? 'text-emerald-600' : 'text-indigo-600'
                        }`}
                      >
                        {total}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* العرض الداخلي: التفاصيل وبنود التقييم */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center border-b pb-4 mb-6">
              <div>
                <h3 className="font-bold text-xl text-gray-800" id="selected-student-name">
                  {selectedStudent ? selectedStudent.name : 'اختر طالبة لعرض/تعديل التقييم'}
                </h3>
                <p className="text-xs text-gray-500 mt-1" id="selected-student-info">
                  {selectedStudent
                    ? `الرقم الجامعي: ${selectedStudent.universityId} | التخصص: ${selectedStudent.major}`
                    : 'الرقم الجامعي: - | التخصص: -'}
                </p>
              </div>
              <div className="text-left bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
                <span className="text-xs text-indigo-600 font-medium block">المجموع الحالي</span>
                <span className="text-2xl font-bold text-indigo-700" id="total-score-display">
                  {currentTotal} / 100
                </span>
              </div>
            </div>

            <form id="evaluation-form" onSubmit={saveEvaluation} className="space-y-5">
              {/* بند 1 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold text-sm text-gray-800">
                    1. الانضباط والالتزام بساعات التدريب واللوائح
                  </label>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
                    20 درجة
                  </span>
                </div>
                <input
                  type="number"
                  id="criterion-1"
                  min="0"
                  max="20"
                  className="eval-input w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="أدخل الدرجة من 20"
                  value={scores.c1}
                  onChange={(e) => handleScoreChange('c1', e.target.value)}
                  required
                />
              </div>

              {/* بند 2 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold text-sm text-gray-800">
                    2. جودة إنجاز المهام والدقة الفنية في المخرجات
                  </label>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
                    30 درجة
                  </span>
                </div>
                <input
                  type="number"
                  id="criterion-2"
                  min="0"
                  max="30"
                  className="eval-input w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="أدخل الدرجة من 30"
                  value={scores.c2}
                  onChange={(e) => handleScoreChange('c2', e.target.value)}
                  required
                />
              </div>

              {/* بند 3 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold text-sm text-gray-800">
                    3. مهارات التواصل والعمل الجماعي والتفاعل مع الفريق
                  </label>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
                    20 درجة
                  </span>
                </div>
                <input
                  type="number"
                  id="criterion-3"
                  min="0"
                  max="20"
                  className="eval-input w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="أدخل الدرجة من 20"
                  value={scores.c3}
                  onChange={(e) => handleScoreChange('c3', e.target.value)}
                  required
                />
              </div>

              {/* بند 4 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold text-sm text-gray-800">
                    4. المبادرة والقدرة على التعلم الذاتي وحل المشكلات
                  </label>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
                    15 درجة
                  </span>
                </div>
                <input
                  type="number"
                  id="criterion-4"
                  min="0"
                  max="15"
                  className="eval-input w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="أدخل الدرجة من 15"
                  value={scores.c4}
                  onChange={(e) => handleScoreChange('c4', e.target.value)}
                  required
                />
              </div>

              {/* بند 5 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold text-sm text-gray-800">
                    5. التقرير النهائي والمناقشة الشفهية داخل الشركة
                  </label>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
                    15 درجة
                  </span>
                </div>
                <input
                  type="number"
                  id="criterion-5"
                  min="0"
                  max="15"
                  className="eval-input w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="أدخل الدرجة من 15"
                  value={scores.c5}
                  onChange={(e) => handleScoreChange('c5', e.target.value)}
                  required
                />
              </div>

              {/* الملاحظات العامة */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظات المشرف الميداني (اختياري)
                </label>
                <textarea
                  id="eval-notes"
                  rows="3"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="أكتب أي ملاحظات إضافية حول أداء الطالبة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                ></textarea>
              </div>

              {/* زر الحفظ */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition shadow-sm flex items-center gap-2"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  حفظ واعتماد التقييم النهائي
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}