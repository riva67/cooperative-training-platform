import React, { useState } from 'react';

export default function Visits() {
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [showAlert, setShowAlert] = useState(false);

  const handleScheduleVisit = (e) => {
    e.preventDefault();
    // إظهار رسالة النجاح والترحيب
    setShowAlert(true);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white shadow-md rounded-lg mt-8" dir="rtl">
      <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">نموذج زيارات المشرف الأكاديمي</h2>
      <p className="text-gray-600 text-center mb-6">جدولة زيارات جهات التدريب وتوثيقها</p>

      {/* رسالة الترحيب والإشعار عند النجاح */}
      {showAlert && (
        <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg text-center animate-bounce">
          <p className="font-bold text-lg">🎉 أهلاً بك وسهلاً في جهة التدريب!</p>
          <p className="text-sm mt-1">تم إرسال إشعار تأكيد الزيارة بنجاح للمشرف الأكاديمي وتم جدولة الموعد.</p>
        </div>
      )}

      <form onSubmit={handleScheduleVisit}>
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2">اسم جهة التدريب:</label>
          <input
            type="text"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="مثال: شركة الاتصالات السعودية"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2">اسم المشرف الأكاديمي:</label>
          <input
            type="text"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={supervisorName}
            onChange={(e) => setSupervisorName(e.target.value)}
            placeholder="د. محمد العمري"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 font-bold mb-2">تاريخ الزيارة:</label>
            <input
              type="date"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-2">وقت الزيارة:</label>
            <input
              type="time"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={visitTime}
              onChange={(e) => setVisitTime(e.target.value)}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition duration-300 mt-4"
        >
          حجدولة الزيارة وإرسال الإشعار
        </button>
      </form>
    </div>
  );
}