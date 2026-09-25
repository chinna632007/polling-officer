const express = require('express');
const { param } = require('express-validator');
const {
  sendAllocationNotification,
  getNotifications,
  resendNotification,
  sendAllNotifications,
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../services/roleService');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all notification endpoints require a valid JWT

// POST /api/notifications/send/:allocationId
// Only Super Admin / Allocation Officer can send SMS notifications.
router.post(
  '/send/:allocationId',
  param('allocationId').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  authorize(ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER),
  sendAllocationNotification
);

router.post(
  '/resend/:id',
  param('id').isMongoId().withMessage('Invalid notification id'),
  handleValidationErrors,
  authorize(ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER),
  resendNotification
);

// POST /api/notifications/send-all
// Bulk SMS: every ALLOCATED officer (optionally body { mandal: "..." }), max 100.
router.post(
  '/send-all',
  authorize(ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER),
  sendAllNotifications
);

// GET /api/notifications (server-scoped for Mandal Officers)
router.get('/', getNotifications);

module.exports = router;