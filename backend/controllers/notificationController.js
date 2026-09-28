const Allocation = require('../models/Allocation');
const Notification = require('../models/Notification');
const IdCard = require('../models/IdCard');
const smsService = require('../services/smsService');
const idCardService = require('../services/idCardService');
const mailService = require('../services/mailService');
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

    // 1) The duty ID card is generated (or reused from cache) FIRST so the
    //    officer receives/downloads it together with the SMS. A card failure
    //    must not block the SMS - it is logged and reported in the response.
    let cardUrl = null;
    let cardIssued = false;
    try {
      const card = await idCardService.getOrCreateCard(allocation._id);
      cardUrl = idCardService.publicCardUrl(card);
      cardIssued = true;
    } catch (cardError) {
      console.error('[NOTIFY] ID card generation failed:', cardError.message);
    }

    // 2) SMS with the booth details + (when available) the card download link.
    const message = smsService.buildAllocationMessage(allocation.officer, allocation.booth, { cardUrl });
    const notification = await smsService.sendSms({
      officer: allocation.officer,
      allocation,
      message,
    });

    // 3) Best-effort: e-mail the SAME ID card download link (no attachment)
    //    when the officer has an e-mail address. Failures never fail the request.
    let email = null;
    if (allocation.officer.email) {
      try {
        email = await mailService.sendAllocationLetter(allocation);
      } catch (mailError) {
        email = { status: 'failed', reason: mailError.message };
      }
    }

    return res.status(200).json({
      success: true,
      message: `Notification queued with status '${notification.status}'`,
      data: notification,
      idCard: { issued: cardIssued, url: cardUrl, received: false },
      email,
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

    // Embed the CURRENT ID-card "received" state per row (not a snapshot):
    // the officer received the card when the tokenised download link was
    // opened for the first time (idCardController.downloadByToken).
    const allocIds = [
      ...new Set(
        data
          .map((n) => (n.allocation ? String(n.allocation._id || n.allocation) : null))
          .filter(Boolean)
      ),
    ];
    let cardsByAllocation = new Map();
    if (allocIds.length) {
      const cards = await IdCard.find({ allocationId: { $in: allocIds } })
        .select('allocationId receivedAt downloadCount lastDownloadedAt filename')
        .lean();
      cardsByAllocation = new Map(cards.map((c) => [String(c.allocationId), c]));
    }
    const rows = data.map((n) => {
      const allocId = n.allocation ? String(n.allocation._id || n.allocation) : null;
      const card = allocId ? cardsByAllocation.get(allocId) : null;
      return {
        ...n,
        idCard: card
          ? {
              issued: true,
              filename: card.filename || '',
              receivedAt: card.receivedAt || null,
              lastDownloadedAt: card.lastDownloadedAt || null,
              downloadCount: card.downloadCount || 0,
            }
          : {
              issued: false,
              filename: '',
              receivedAt: null,
              lastDownloadedAt: null,
              downloadCount: 0,
            },
      };
    });

    return res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
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
    let cardsIssued = 0;
    let emailed = 0;
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
        // ID card first (best-effort): the SMS carries the download link and
        // the officer also gets the card by e-mail when an address exists.
        let cardUrl = null;
        try {
          const card = await idCardService.getOrCreateCard(allocation._id);
          cardUrl = idCardService.publicCardUrl(card);
          cardsIssued += 1;
        } catch (cardError) {
          console.error('[NOTIFY] ID card generation failed:', cardError.message);
        }

        const message = smsService.buildAllocationMessage(allocation.officer, allocation.booth, { cardUrl });
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
          // Best-effort: e-mail the same card (PDF attachment). Never fails
          // the bulk run.
          if (allocation.officer.email) {
            try {
              const emailResult = await mailService.sendAllocationLetter(allocation);
              if (emailResult && emailResult.status === 'sent') emailed += 1;
            } catch (mailError) {
              console.error('[NOTIFY] bulk e-mail failed:', mailError.message);
            }
          }
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
      message: `Notifications processed: ${sent} sent, ${failed} failed, ${skipped} skipped. ID cards issued: ${cardsIssued}. E-mails sent: ${emailed}.`,
      data: { total: allocations.length, sent, failed, skipped, cardsIssued, emailed, failures },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { sendAllocationNotification, getNotifications, sendAllNotifications };