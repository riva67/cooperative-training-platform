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
  .btn { background: #3182ce; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: inherit; }
  .btn:hover { background: #2b6cb0; }
  .alert-success { background-color: #c6f6d5; color: #22543d; padding: 10px; border-radius: 6px; margin-top: 15px; font-size: 14px; font-weight: bold; }
`;

export default function CapacityManagement() {
  // إدارة حالة مدخلات النموذج
  const [title, setTitle] = useState("مطور واجهات أمامية (Frontend Developer)");
  const [capacity, setCapacity] = useState(4);
  const [description, setDescription] = useState("تدريب تعريفي وتطبيقي على تقنيات تطوير الويب الحديثة وإدارة المشاريع.");
  const [message, setMessage] = useState("");

  // معالجة حفظ البيانات
  const handleSave = (e) => {
    e.preventDefault();
    setMessage("تم حفظ وتحديث المقاعد بنجاح!");
    setTimeout(() => setMessage(""), 3000);
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
            <a href="capacity.html" className="active">إدارة المقاعد</a>
            <a href="evaluation.html">التقييم (من 100)</a>
            <a href="reports.html">التقارير والشكاوى</a>
          </div>
        </div>

        {/* كرت النموذج */}
        <div className="card">
          <h3>تحديد الفرص التدريبية وعدد المقاعد (Capacity)</h3>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>مسمى الفرصة التدريبية:</label>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>إجمالي المقاعد المتاحة:</label>
              <input
                type="number"
                className="form-control"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>وصف الفرصة ومتطلباتها:</label>
              <textarea
                className="form-control"
                rows="3"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            <button type="submit" className="btn">
              حفظ وتحديث المقاعد
            </button>
          </form>

          {/* رسالة التأكيد عند الحفظ */}
          {message && <div className="alert-success">{message}</div>}
        </div>
      </div>
    </div>
  );
}