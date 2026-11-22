// The 8 criteria of "نموذج (2): تقييم المتدرب من جهة التدريب" (5 points each, 40 total).
// `key` is what the API uses; `label` is the Arabic text printed on the form.
const CRITERIA = [
  { key: 'attendance', label: 'الحضور والمواظبة في أوقات الدوام الرسمية', max: 5 },
  { key: 'practical_application', label: 'القدرة على التطبيق العملي للمعارف والمهارات', max: 5 },
  { key: 'ambition', label: 'الطموح والرغبة في التعلم واكتساب خبرة جديدة', max: 5 },
  { key: 'cooperation', label: 'الرغبة في التعاون والمشاركة في العمل', max: 5 },
  { key: 'conduct', label: 'حسن التعامل مع الزملاء والاهتمام بالمظهر والسلوك العام', max: 5 },
  { key: 'regulations', label: 'مدى الالتزام بلوائح وأنظمة المنشأة', max: 5 },
  { key: 'performance', label: 'مستوى الأداء والإنتاجية', max: 5 },
  { key: 'tools', label: 'القدرة على استعمال أدوات العمل والمحافظة عليها', max: 5 },
];

const MAX_TOTAL = CRITERIA.reduce((sum, c) => sum + c.max, 0); // 40

module.exports = { CRITERIA, MAX_TOTAL };
