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
    ]);

    const attendanceTotal = attendanceByStatus.reduce((s, r) => s + r._count, 0);
    const attended = attendanceByStatus
      .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
      .reduce((s, r) => s + r._count, 0);

    res.json({
      totalOpportunities,
      openOpportunities,
      totalApplications,
      activeAssignments,
      completedAssignments,
      completionRate: totalAssignments ? round1((completedAssignments / totalAssignments) * 100) : 0,
      averageFinalGrade: gradeAgg._avg.grade === null ? null : round1(gradeAgg._avg.grade),
      wouldHireRate: pct(wouldHireCount, evalAgg._count),             // employment indicator
      averageAttendanceRate: pct(attended, attendanceTotal),
      // Extra: average organization evaluation (out of 40) = training-provider satisfaction with the trainees
      averageEvaluationScore: evalAgg._avg.totalScore === null ? null : round1(evalAgg._avg.totalScore),
    });
  })
);

module.exports = router;