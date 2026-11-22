const router = require('express').Router();
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (part, whole) => (whole ? round1((part / whole) * 100) : null);

// GET /stats/summary  -> the project's impact indicators (ADMIN or ACADEMIC_SUPERVISOR)
router.get(
  '/stats/summary',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const [
      totalOpportunities, openOpportunities, totalApplications,
      activeAssignments, completedAssignments, totalAssignments,
      gradeAgg, evalAgg, wouldHireCount, attendanceByStatus,
      satisfactionAgg, employmentResponses, employedCount, organizations,
    ] = await Promise.all([
      prisma.trainingOpportunity.count(),
      prisma.trainingOpportunity.count({ where: { status: 'OPEN' } }),
      prisma.application.count(),
      prisma.trainingAssignment.count({ where: { status: 'ACTIVE' } }),
      prisma.trainingAssignment.count({ where: { status: 'COMPLETED' } }),
      prisma.trainingAssignment.count(),
      prisma.finalGrade.aggregate({ _avg: { grade: true } }),
      prisma.evaluation.aggregate({ _avg: { totalScore: true }, _count: true }),
      prisma.evaluation.count({ where: { wouldHire: true } }),
      prisma.attendance.groupBy({ by: ['status'], _count: true }),
      prisma.evaluation.aggregate({ _avg: { satisfaction: true }, _count: { satisfaction: true } }),
      prisma.trainingAssignment.count({ where: { status: 'COMPLETED', employedAfterTraining: { not: null } } }),
      prisma.trainingAssignment.count({ where: { status: 'COMPLETED', employedAfterTraining: true } }),
      prisma.organization.groupBy({ by: ['type'], _count: true }),
    ]);
    const avgSatisfaction = satisfactionAgg._avg.satisfaction;

    const attendanceTotal = attendanceByStatus.reduce((s, r) => s + r._count, 0);
    const attended = attendanceByStatus
      .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
      .reduce((s, r) => s + r._count, 0);

    res.json({
      // ── the four impact indicators of the project ──
      totalOpportunities,                                                   // عدد فرص التدريب
      completionRate: totalAssignments ? round1((completedAssignments / totalAssignments) * 100) : 0, // نسبة إكمال التدريب
      providerSatisfaction: avgSatisfaction === null ? null : round1(avgSatisfaction),          // رضا جهات التدريب (1..5)
      providerSatisfactionRate: avgSatisfaction === null ? null : round1(((avgSatisfaction - 1) / 4) * 100), // same, as %
      providerSatisfactionResponses: satisfactionAgg._count.satisfaction,
      employmentRate: pct(employedCount, employmentResponses),               // نسبة التوظيف بعد التدريب
      employmentResponses,

      // ── more detail ──
      openOpportunities,
      organizationsByType: Object.fromEntries(organizations.map((r) => [r.type, r._count])),
      totalApplications,
      activeAssignments,
      completedAssignments,
      averageFinalGrade: gradeAgg._avg.grade === null ? null : round1(gradeAgg._avg.grade),
      wouldHireRate: pct(wouldHireCount, evalAgg._count),             // providers that WANT to hire (intention)
      averageAttendanceRate: pct(attended, attendanceTotal),
      // Extra: average organization evaluation (out of 40) = training-provider satisfaction with the trainees
      averageEvaluationScore: evalAgg._avg.totalScore === null ? null : round1(evalAgg._avg.totalScore),
    });
  })
);

module.exports = router;