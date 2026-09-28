/**
 * idCardService — renders the official Polling Duty ID card (PDF, pdfkit) for
 * an allocation and caches it in the IdCard collection.
 *
 * - renderOfficerIdCard(): pure pdfkit rendering officer + booth + allocation
 *   into a landscape card -> Buffer (no database needed; unit-testable).
 * - getOrCreateCard(): loads the allocation (populated), renders the card once
 *   and stores it — later mails/downloads reuse the cached PDF. Race-safe via
 *   the unique allocationId index (duplicate-key -> return the winner).
 * - publicCardUrl(): tokenised link embedded in the SMS so the officer can
 *   download the card from their phone without a session.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const IdCard = require('../models/IdCard');
const Allocation = require('../models/Allocation');

const CARD_W = 480;
const CARD_H = 300;

const COLORS = {
  navy: '#0f2a5c',
  accent: '#1d4ed8',
  ink: '#1f2937',
  muted: '#6b7280',
  panel: '#f8fafc',
  border: '#c7d2fe',
  faint: '#93c5fd',
  lightText: '#cbd5f5',
};

function votingHours() {
  return (process.env.VOTING_HOURS || '7:00 AM - 6:00 PM').trim();
}

function electionName() {
  return (process.env.ELECTION_NAME || 'General Elections').trim();
}

function short(value, fallback = '-') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function formatDate(d) {
  const date = d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatDateTime(d) {
  const date = d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hh}:${mi}`;
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'OF';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function officerAddress(o = {}) {
  return [
    o.houseNo || o.houseNumber || '',
    o.street || '',
    o.locality || '',
    o.ward ? `Ward ${o.ward}` : '',
    o.district || '',
    o.pinCode || '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Grey uppercase label + single-line (ellipsis-truncated) value pairs. */
function drawRows(doc, rows, x, y, { labelW, rowH, valueW, labelSize = 6.5, valueSize = 8.5 }) {
  rows.forEach((row, i) => {
    const rowY = y + i * rowH;
    doc.font('Helvetica').fillColor(COLORS.muted).fontSize(labelSize)
      .text(String(row.label).toUpperCase(), x, rowY + 2, { lineBreak: false });
    doc.font('Helvetica').fillColor(COLORS.ink).fontSize(valueSize)
      .text(row.value, x + labelW, rowY, { width: valueW, ellipsis: true, lineBreak: false });
  });
}

/** Draws the whole card onto an open pdfkit document (fixed layout). */
function renderCard(doc, { officer = {}, booth = {}, allocation = {} }) {
  // --- header band -------------------------------------------------------
  doc.rect(0, 0, CARD_W, 46).fill(COLORS.navy);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
    .text('POLLING DUTY OFFICER ID CARD', 14, 11, { lineBreak: false });
  doc.fillColor(COLORS.lightText).font('Helvetica').fontSize(7)
    .text(`${electionName()} - Election Administration`, 14, 27, { lineBreak: false });
  doc.roundedRect(398, 14, 68, 17, 3).fill(COLORS.accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
    .text('OFFICIAL', 398, 19, { width: 68, align: 'center', lineBreak: false });

  // --- photo placeholder ---------------------------------------------------
  doc.lineWidth(1);
  doc.rect(14, 58, 72, 92).fillAndStroke('#eef2ff', '#94a3b8');
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(20)
    .text(initialsOf(officer.officerName || officer.name), 14, 88, {
      width: 72, align: 'center', lineBreak: false,
    });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.5)
    .text('AFFIX RECENT PHOTO', 14, 140, { width: 72, align: 'center', lineBreak: false });

  // --- officer details ------------------------------------------------------
  const fx = 96;
  const fw = CARD_W - fx - 14;
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5)
    .text('NAME', fx, 58, { lineBreak: false });
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
    .text(short(officer.officerName || officer.name, 'Officer'), fx, 66, {
      width: fw, ellipsis: true, lineBreak: false,
    });

  drawRows(
    doc,
    [
      { label: 'Officer ID', value: short(officer.officerId) },
      { label: 'Designation', value: short(officer.designation) },
      { label: 'Mobile', value: short(officer.mobileNumber) },
      { label: 'E-mail', value: short(officer.email, 'Not provided') },
    ],
    fx,
    86,
    { labelW: 58, rowH: 13, valueW: fw - 58 }
  );

  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5)
    .text('RESIDENTIAL ADDRESS', fx, 139, { lineBreak: false });
  doc.fillColor(COLORS.ink).font('Helvetica').fontSize(7.5)
    .text(officerAddress(officer) || 'Not recorded', fx, 147, {
      width: fw, height: 18, ellipsis: true,
    });

  // --- duty allocation panel -------------------------------------------------
  doc.roundedRect(14, 178, CARD_W - 28, 92, 4).fillAndStroke(COLORS.panel, COLORS.border);
  doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(8)
    .text('DUTY ALLOCATION', 24, 186, { lineBreak: false });

  const b = booth || {};
  drawRows(
    doc,
    [
      { label: 'Booth No.', value: short(b.boothNumber) },
      { label: 'Booth Name', value: short(b.boothName) },
      { label: 'Building', value: short(b.buildingName) },
      { label: 'Locality', value: short(b.locality) },
    ],
    24,
    202,
    { labelW: 62, rowH: 16, valueW: 150 }
  );

  drawRows(
    doc,
    [
      { label: 'Mandal', value: short(b.mandal || allocation.mandal || officer.mandal) },
      { label: 'District', value: short(b.district || officer.district) },
      { label: 'Duty Date', value: formatDate(allocation.allocationDate) },
      { label: 'Allocation ID', value: `...${String(allocation._id || '').slice(-8)}` },
    ],
    240,
    202,
    { labelW: 62, rowH: 16, valueW: 150 }
  );

  // --- footer band ------------------------------------------------------------
  doc.rect(0, CARD_H - 30, CARD_W, 30).fill(COLORS.navy);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
    .text(`VOTING DUTY TIMING: ${votingHours()}`, 14, CARD_H - 22, { lineBreak: false });
  doc.fillColor(COLORS.faint).font('Helvetica').fontSize(5.5)
    .text('Carry this card at all times during polling duty - Election Administration', 14, CARD_H - 10, {
      lineBreak: false,
    });
  doc.fillColor(COLORS.lightText).font('Helvetica').fontSize(5.5)
    .text(`Generated: ${formatDateTime(new Date())}`, CARD_W - 154, CARD_H - 22, {
      width: 140, align: 'right', lineBreak: false,
    });
}

/**
 * Renders the ID card PDF for a (populated) allocation-like object.
 * Returns a Promise<Buffer>.
 */
function renderOfficerIdCard(payload = {}) {
  return new Promise((resolve, reject) => {
    let doc;
    try {
      doc = new PDFDocument({
        size: [CARD_W, CARD_H],
        margin: 0,
        info: {
          Title: `Polling Duty ID Card - ${payload.officer?.officerId || 'Officer'}`,
          Author: 'Election Administration',
          Creator: 'polling-officer',
        },
      });
    } catch (err) {
      return reject(err);
    }
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      renderCard(doc, payload);
      doc.end();
    } catch (err) {
      try { doc.end(); } catch { /* already closed */ }
      reject(err);
    }
  });
}

/**
 * Loads the allocation (populated) and returns its cached IdCard document,
 * generating + storing the PDF on first use.
 * Validations: allocation must exist, have an officer and be ALLOCATED.
 */
async function getOrCreateCard(allocationId, { force = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(allocationId || ''))) {
    throw Object.assign(new Error('Invalid allocation id'), { statusCode: 400 });
  }

  if (!force) {
    const existing = await IdCard.findOne({ allocationId });
    if (existing) return existing;
  }

  const allocation = await Allocation.findById(allocationId)
    .populate(
      'officer',
      'officerId officerName name designation mobileNumber email houseNo houseNumber street locality ward mandalId mandal district pinCode'
    )
    .populate('booth', 'boothNumber boothName buildingName locality ward mandal district');

  if (!allocation) {
    throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });
  }
  if (!allocation.officer) {
    throw Object.assign(new Error('Allocation has no officer record'), { statusCode: 400 });
  }
  if (allocation.status !== 'ALLOCATED') {
    throw Object.assign(
      new Error('ID card can only be issued for an ALLOCATED officer'),
      { statusCode: 409 }
    );
  }

  const pdf = await renderOfficerIdCard({
    officer: allocation.officer,
    booth: allocation.booth || {},
    allocation,
  });
  const filename = `ID-Card-${short(allocation.officer.officerId, 'officer')}.pdf`;

  try {
    return await IdCard.create({
      allocationId: allocation._id,
      officer: allocation.officer._id,
      pdf,
      filename,
      downloadToken: crypto.randomBytes(24).toString('hex'),
    });
  } catch (err) {
    // Lost a create race (unique allocationId index) -> reuse the winner.
    if (err && err.code === 11000) {
      const existing = await IdCard.findOne({ allocationId });
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Public (token-gated) URL for a stored card, embedded in the SMS so the
 * officer can download the PDF from a phone without an admin session.
 */
function publicCardUrl(card) {
  const base = (
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 5002}`
  ).replace(/\/+$/, '');
  return `${base}/api/idcards/pdf/${card._id}?token=${card.downloadToken}`;
}

module.exports = {
  renderOfficerIdCard,
  getOrCreateCard,
  publicCardUrl,
};
