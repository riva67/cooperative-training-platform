import React from 'react';
import { LayoutDashboard, CheckSquare, FileText, Building2, Bell, ShieldCheck, LogOut, Briefcase, CalendarCheck } from 'lucide-react';

// Design: emerald theme (Ghadah's update). Connected: opportunities tab, unread-notifications badge, real logout.
export default function Sidebar({ activeTab, setActiveTab, unreadCount = 0, onLogout }) {
  const menuItems = [
    { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'opportunities', label: 'فرص التدريب', icon: Briefcase },
    { id: 'activities', label: 'توثيق الأنشطة', icon: Building2 },
    { id: 'attendance', label: 'الحضور والانصراف', icon: CalendarCheck },
    { id: 'reports', label: 'التقارير الأسبوعية', icon: FileText },
    { id: 'tasks', label: 'المهام والجدول', icon: CheckSquare },
    { id: 'notifications', label: 'الإشعارات', icon: Bell },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 h-screen fixed right-0 top-0 flex flex-col justify-between border-l border-slate-800 shadow-xl z-20 rtl" dir="rtl">
      {/* الجزء العلوي: الشعار والعنوان */}
      <div>
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-md shadow-emerald-900/50 flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="font-bold text-white text-base">بوابة التدريب</h2>
            <p className="text-[11px] text-emerald-400 font-medium">النظام التعاوني الموحد</p>
          </div>
        </div>

        {/* قائمة التنقل مع حركات انزلاق ناعمة */}
        <nav className="p-4 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition-all duration-300 transform hover:translate-x-1 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 font-bold scale-[1.02]'
                    : 'text-slate-400 hover:bg-emerald-950/50 hover:text-emerald-300'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-emerald-500'} />
                <span className="flex-1 text-right">{item.label}</span>
                {item.id === 'notifications' && unreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* الجزء السفلي: زر تسجيل الخروج */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 transition"
        >
          <LogOut size={18} />
          <span>تسجيل خروج</span>
        </button>
      </div>
    </aside>
  );
}
