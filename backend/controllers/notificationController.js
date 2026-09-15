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

module.exports = { sendAllocationNotification, getNotifications, resendNotification };