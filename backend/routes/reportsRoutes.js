const express = require('express');
const excelService = require('../services/excelService');
const roleService = require('../services/roleService');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect); // all report downloads require a valid JWT

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendWorkbook(res, buffer, filename) {
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Let the browser read the filename from this header even cross-origin.
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Content-Type', XLSX_MIME);
  return res.send(buffer);
}

/**
 * Every report is scoped server-side: Mandal Officers may only download the
 * data of their assigned Mandal; SUPER_ADMIN / ALLOCATION_OFFICER download
 * the full dataset.
 */

// GET /api/reports/officers-excel
router.get('/officers-excel', async (req, res, next) => {
  try {
    const scope = roleService.scopeFilter(req.user) || {};
    sendWorkbook(res, await excelService.officerReport(scope), 'officers-report.xlsx');
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/booths-excel
router.get('/booths-excel', async (req, res, next) => {
  try {
    const scope = roleService.scopeFilter(req.user) || {};
    sendWorkbook(res, await excelService.boothReport(scope), 'booths-report.xlsx');
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/allocation-excel
router.get('/allocation-excel', async (req, res, next) => {
  try {
    const scope = roleService.scopeFilter(req.user) || {};
    sendWorkbook(res, await excelService.allocationReport(scope), 'allocated-officers.xlsx');
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/unallocated-officers
router.get('/unallocated-officers', async (req, res, next) => {
  try {
    const scope = roleService.scopeFilter(req.user) || {};
    sendWorkbook(
      res,
      await excelService.unallocatedOfficersReport(scope),
      'unallocated-officers.xlsx'
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/notifications-excel
router.get('/notifications-excel', async (req, res, next) => {
  try {
    const notifScope = await roleService.notificationScopeFilter(req.user);
    sendWorkbook(res, await excelService.notificationReport(notifScope), 'notification-status.xlsx');
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/allocation-by-mandal
// A single workbook with ONE sheet per Mandal (each sheet = allocated officers
// of that Mandal, sorted by Officer ID ascending). Officers are never mixed
// across Mandals.
router.get('/allocation-by-mandal', async (req, res, next) => {
  try {
    const scope = roleService.scopeFilter(req.user) || {};
    sendWorkbook(
      res,
      await excelService.allocationReportByMandal(scope),
      'allocation-by-mandal.xlsx'
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/allocated-officers/:mandal
// Downloadable allocated-officers list for a single Mandal. The :mandal param is
// matched case-insensitively, so "Jami", "jami" and " JAMI " all match.
router.get('/allocated-officers/:mandal', async (req, res, next) => {
  try {
    const scope = roleService.scopeFilter(req.user) || {};
    const mandalName = decodeURIComponent(req.params.mandal || '');
    sendWorkbook(
      res,
      await excelService.allocatedOfficersReportForMandal(scope, mandalName),
      `allocated-${encodeURIComponent(String(mandalName || 'mandal')).replace(/[^a-z0-9]/gi, '_') || 'mandal'}.xlsx`
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;