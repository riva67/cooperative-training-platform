const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { getAccessibleAssignment } = require('../../utils/access');

// GET /assignments/:id/letter  -> data for the official training letter (the frontend renders / prints it)
const generateTrainingLetter = asyncHandler(async (req, res) => {
  const access = await getAccessibleAssignment(req.user, req.params.id); // 400 / 403 / 404 handled
  const assignment = await prisma.trainingAssignment.findUnique({
    where: { id: access.id },
    include: {
      student: { include: { user: { select: { name: true } } } },
      opportunity: { include: { organization: true } },
    },
  });

  const studentName = assignment.student.user.name;
  const companyName = assignment.opportunity.organization.name;
  const fmt = (d) => d.toISOString().split('T')[0];

  res.json({
    title: 'خطاب تدريب تعاوني رسمي',
    issuedDate: fmt(new Date()),
    university: 'جامعة نجران - الكلية التطبيقية',
    companyName,
    studentName,
    universityId: assignment.student.universityId,
    major: assignment.student.major,
    trainingTitle: assignment.opportunity.title,
    startDate: fmt(assignment.startDate),
    endDate: fmt(assignment.endDate),
    content:
      `إشارة إلى برنامج التدريب التعاوني، نفيد الكلية التطبيقية بجامعة نجران بأن الطالب/ة (${studentName}) ` +
      `تم قبول تدريبه/ها في ${companyName} للفترة من ${fmt(assignment.startDate)} إلى ${fmt(assignment.endDate)}.`,
  });
});

module.exports = { generateTrainingLetter };