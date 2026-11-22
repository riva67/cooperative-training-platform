import React, { useState } from 'react';

// الأنماط والتنسيقات الأصلية
const STYLES = `
  :root {
      --primary-gradient: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      --bg-color: #f4f6f9;
      --text-main: #2d3748;
  }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; }
  .container { max-width: 1000px; margin: auto; }
  .navbar {
      background: var(--primary-gradient);
      padding: 15px 25px;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      margin-bottom: 30px;
  }
  .navbar h2 { color: white; margin: 0; font-size: 18px; }
  .nav-links { display: flex; gap: 10px; flex-wrap: wrap; }
  .nav-links a {
      color: white;
      text-decoration: none;
      background: rgba(255,255,255,0.15);
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      transition: 0.2s;
  }
  .nav-links a:hover, .nav-links a.active { background: rgba(255,255,255,0.35); font-weight: bold; }
  .card {
      background: white;
      padding: 25px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
  .card h3 { margin-top: 0; color: #1e3c72; border-bottom: 2px solid #edf2f7; padding-bottom: 10px; }
  .form-group { margin-bottom: 15px; }
  .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 14px; }
  .form-control { width: 100%; padding: 10px; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; font-family: inherit; }
  .btn-danger { background: #e53e3e; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: inherit; }
  .btn-danger:hover { background: #c53030; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
  .alert-success { background-color: #c6f6d5; color: #22543d; padding: 10px; border-radius: 6px; margin-top: 15px; font-size: 14px; font-weight: bold; }
  @media(max-width: 640px) {
      .grid-2 { grid-template-columns: 1fr; }
  }
`;

export default function ReportsAndComplaints() {
  // حالات النموذج
  const [student, setStudent] = useState("سارة أحمد");
  const [reportType, setReportType] = useState("تقرير زيارة ميدانية");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");

  // معالجة إرسال التقرير
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!details.trim()) {
      alert("الرجاء كتابة تفاصيل التقرير أو الملاحظة.");
      return;
    }
    setMessage(`تم إرسال التقرير الخاص بالمتدربة (${student}) إلى الجامعة بنجاح!`);
    setDetails("");
    setTimeout(() => setMessage(""), 4000);
  };

  return (
    <div dir="rtl">
      <style>{STYLES}</style>
      <div className="container">
        {/* شريط التنقل */}
        <div className="navbar">
          <h2>بوابة جهة التدريب (الشركة)</h2>
          <div className="nav-links">
            <a href="index.html">الرئيسية</a>
            <a href="capacity.html">إدارة المقاعد</a>
            <a href="evaluation.html">التقييم (من 100)</a>
            <a href="reports.html" className="active">التقارير والشكاوى</a>
          </div>
        </div>

        {/* كرت نموذج التقارير والتحذيرات */}
        <div className="card">
          <h3>نموذج الزيارة الميدانية، التقارير والتحذيرات</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label>اختر المتدربة:</label>
                <select
                  className="form-control"
                  value={student}
                  onChange={(e) => setStudent(e.target.value)}
                >
                  <option value="سارة أحمد">سارة أحمد</option>
                  <option value="ريم خالد">ريم خالد</option>
                </select>
              </div>

              <div className="form-group">
                <label>نوع التقرير / الملاحظة:</label>
                <select
                  className="form-control"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="تقرير زيارة ميدانية">تقرير زيارة ميدانية</option>
                  <option value="تقرير أداء أسبوعي">تقرير أداء أسبوعي</option>
                  <option value="إنذار غياب أو تقصير">إنذار غياب أو تقصير</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>تفاصيل الملاحظات أو الشكوى:</label>
              <textarea
                className="form-control"
                rows="4"
                placeholder="اكتب تفاصيل الملاحظة أو التقرير هنا..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              ></textarea>
            </div>

            <button type="submit" className="btn-danger">
              إرسال التقرير / الإنذار للجامعة
            </button>
          </form>

          {/* رسالة تأكيد الإرسال */}
          {message && <div className="alert-success">{message}</div>}
        </div>
      </div>
    </div>
  );
}