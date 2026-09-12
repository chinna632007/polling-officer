const mongoose = require('mongoose');

const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'DEMO_SENT'];

const notificationSchema = new mongoose.Schema(
  {
    officer: { type: mongoose.Schema.Types.ObjectId, ref: 'Officer', required: true },
    officerName: { type: String, trim: true, default: '' },
    booth: { type: mongoose.Schema.Types.ObjectId, ref: 'Booth', default: null },
    mandal: { type: String, trim: true, default: '' },
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation' },
    mobileNumber: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: 'PENDING',
    },
    providerMessageId: { type: String },
    provider: { type: String, default: 'mock' },
    error: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1 });
notificationSchema.index({ officer: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_STATUSES = NOTIFICATION_STATUSES;