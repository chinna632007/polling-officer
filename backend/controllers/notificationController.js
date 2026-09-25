const Allocation = require('../models/Allocation');
const Notification = require('../models/Notification');
const smsService = require('../services/smsService');
const { notificationScopeFilter } = require('../services/roleService');

async function sendAllocationNotification(req, res, next) {
  try {
    const allocation = await Allocation.findById(req.params.allocationId)
      .populate('officer')
      .populate('booth');

    if (!allocation) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }
    if (!allocation.booth) {
      return res.status(400).json({
        success: false,
        message: 'This officer has no booth allocation - cannot send a notification',
      });
    }
    if (allocation.status !== 'ALLOCATED') {
      return res.status(400).json({
        success: false,
        message: 'Notification can only be sent for an ALLOCATED allocation',
      });
    }
    if (!allocation.officer) {
      return res.status(404).json({ success: false, message: 'Officer record missing' });
    }

    const message = smsService.buildAllocationMessage(allocation.officer, allocation.booth);
    const notification = await smsService.sendSms({
      officer: allocation.officer,
      allocation,
      message,
    });

    return res.status(200).json({
      success: true,
      message: `Notification queued with status '${notification.status}'`,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
}

async function getNotifications(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const notifScope = await notificationScopeFilter(req.user);
    Object.assign(filter, notifScope);

    // Optional exact-Mandal filter (?mandal=NAME): matches the notification's
    // Mandal snapshot OR the linked officer's current Mandal (safe fallback
    // for older records). Combined with the role scope above via $and.
    const mandal = String(req.query.mandal || '').trim();
    if (mandal) {
      const re = new RegExp(`^${mandal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const Officer = require('../models/Officer');
      const officers = await Officer.find({ mandal: re }).select('_id').lean();
      const mandalOr = [{ mandal: re }];
      if (officers.length) mandalOr.push({ officer: { $in: officers.map((o) => o._id) } });
      const base = { ...filter };
      Object.keys(base).forEach((k) => delete filter[k]);
      Object.assign(filter, { $and: [base, { $or: mandalOr }] });
    }

    const query = Notification.find(filter).populate('officer').populate('booth').populate({ path: 'allocation', populate: { path: 'booth' } }).sort({ createdAt: -1 });

    const [data, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

async function resendNotification(req, res, next) {
  try {
    const Notification = require('../models/Notification');
    const notification = await Notification.findById(req.params.id).populate('officer');
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    const smsService = require('../services/smsService');
    const provider = smsService.createProvider();
    try {
      const result = await provider.send(notification.mobileNumber, notification.message);
      notification.status = provider.name === 'mock' ? smsService.STATUS.DEMO_SENT : (result.delivered ? 'SENT' : 'PENDING');
      notification.providerMessageId = result.messageId;
      notification.sentAt = new Date();
      notification.error = undefined;
      await notification.save();
    } catch (error) {
      notification.status = 'FAILED';
      notification.error = error.message;
      await notification.save();
    }
    return res.json({ success: true, message: 'Notification re-sent with status ' + notification.status, data: notification });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/notifications/send-all
 * Bulk variant: sends the polling-duty SMS to EVERY allocated officer
 * (optionally narrowed to one Mandal via body { mandal }). Reuses the same
 * validation + smsService pipeline as the single-send endpoint.
 */
async function sendAllNotifications(req, res, next) {
  try {
    const max = 100;
    const filter = { status: 'ALLOCATED' };

    const body = req.body || {};
    const allocationIds = Array.isArray(body.allocationIds) ? body.allocationIds : [];
    const mandal = String(body.mandal || '').trim();

    if (allocationIds.length) {
      filter._id = { $in: allocationIds };
    } else if (mandal) {
      const re = new RegExp(`^${mandal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      filter.$or = [{ mandal: re }, { 'officer.mandal': re }];
    }

    const allocations = await Allocation.find(filter)
      .populate('officer')
      .populate('booth')
      .limit(max);

    if (!allocations.length) {
      return res.status(404).json({
        success: false,
        message: 'No ALLOCATED allocations match the request',
      });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const allocation of allocations) {
      if (!allocation.booth) {
        skipped += 1;
        continue;
      }
      if (!allocation.officer || !allocation.officer.mobileNumber) {
        skipped += 1;
        failures.push({
          allocationId: allocation._id,
          officer: allocation.officer?.officerName || '',
          reason: 'no mobile number',
        });
        continue;
      }
      try {
        const message = smsService.buildAllocationMessage(allocation.officer, allocation.booth);
        const notification = await smsService.sendSms({
          officer: allocation.officer,
          allocation,
          message,
        });
        if (notification.status === 'FAILED') {
          failed += 1;
          failures.push({
            allocationId: allocation._id,
            officer: allocation.officer.officerName || '',
            reason: notification.error || 'provider failure',
          });
        } else {
          sent += 1;
        }
      } catch (error) {
        failed += 1;
        failures.push({
          allocationId: allocation._id,
          officer: allocation.officer?.officerName || '',
          reason: error.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Notifications processed: ${sent} sent, ${failed} failed, ${skipped} skipped.`,
      data: { total: allocations.length, sent, failed, skipped, failures },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { sendAllocationNotification, getNotifications, resendNotification, sendAllNotifications };