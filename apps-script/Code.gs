/** ===========================================================================
 * NOVA — Booking + CRM backend (Google Apps Script)
 * ---------------------------------------------------------------------------
 * One file, four jobs:
 *   1. doGet  — serve availability (month overview + day slots) as JSON
 *   2. doPost — validate, double-booking-guard, write booking, calendar, email
 *   3. scanReminders — 5-min trigger: 24h + 30m reminder emails, deduped
 *   4. setup  — one-time: builds the CRM sheet, formatting, and the trigger
 *
 * Deployment notes live in RUNBOOK.md in the site repo.
 * Script timezone must be Pacific/Auckland (set in appsscript.json).
 * The Resend API key lives in Script Properties — never in this file.
 * =========================================================================== */

/* ------------------------------ CONFIG ------------------------------------
 * Change your hours here, save, then Deploy > Manage deployments > Edit >
 * Version: New. That's the whole process.                                   */
var CONFIG = {
  openDays: [1, 2, 3, 4, 5],      // Mon–Fri (0 = Sunday)
  dayStart: '09:00',              // first slot may start at
  dayEnd:   '17:00',              // last slot must END by
  slotMinutes: 30,                // meeting length
  bufferMinutes: 15,              // gap after each meeting
  minNoticeHours: 24,             // earliest a booking can land
  maxAheadDays: 28,               // how far the calendar opens
  address: '38A Finn Ave, Rolleston',
  services: [
    'Website build',
    'Website care plan',
    'Short-form video pack',
    'Monthly video retainer',
    'Website + video',
    'Not sure yet'
  ],
  meetingTypes: ['Face to Face', 'Online video call'],
  sheetName: 'Bookings',
  dashName: 'Dashboard',
  fromName: 'Kaushik at Nova'
};

var TZ = 'Pacific/Auckland';

/* Column order in the Bookings tab (1-based). setup() writes these headers. */
var COL = {
  TIMESTAMP: 1, NAME: 2, EMAIL: 3, PHONE: 4, TYPE: 5, SERVICE: 6,
  COMPANY: 7, ABOUT: 8, START: 9, END: 10, WHERE: 11,
  STAGE: 12, NOTES: 13, FOLLOWUP: 14, R24: 15, R30: 16
};
var HEADERS = [
  'Timestamp', 'Name', 'Email', 'Phone', 'Meeting type', 'Service',
  'Company', 'About', 'Meeting start', 'Meeting end', 'Where',
  'Stage', 'Notes', 'Next follow-up', 'Reminder24hSent', 'Reminder30mSent'
];


/* ================================ doGet ==================================
 * ?fn=month&year=2026&month=7   → { ok, days: [{ d:'2026-07-08', open:true }] }
 * ?fn=slots&date=2026-07-08     → { ok, slots: ['09:00','09:45', ...] }
 * ========================================================================= */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.fn === 'month') return json_(monthAvailability_(Number(p.year), Number(p.month)));
    if (p.fn === 'slots') return json_({ ok: true, slots: freeSlots_(p.date) });
    return json_({ ok: true, service: 'nova-booking', time: nzFormat_(new Date()) });
  } catch (err) {
    return json_({ ok: false, error: 'Something went wrong reading availability. Please try again.' });
  }
}

/* ================================ doPost =================================
 * Body is JSON sent as text/plain (avoids the CORS preflight Apps Script
 * can't answer). Re-validates everything, then books inside a script lock.
 * ========================================================================= */
function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'We couldn\'t read that request. Please refresh and try again.' }); }

  // ---- Validate at the boundary ----
  var name    = clean_(data.name, 100);
  var email   = clean_(data.email, 150);
  var phone   = clean_(data.phone, 40);
  var type    = clean_(data.type, 30);
  var service = clean_(data.service, 60);
  var company = clean_(data.company, 120);
  var about   = clean_(data.about, 1500);
  var date    = clean_(data.date, 10);    // 'yyyy-MM-dd'
  var time    = clean_(data.time, 5);     // 'HH:mm'

  if (!name || !email || !phone || !company || !about)
    return json_({ ok: false, error: 'Please fill in every field — I read all of them before we meet.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json_({ ok: false, error: 'That email doesn\'t look right — mind checking it?' });
  if (phone.replace(/\D/g, '').length < 7)
    return json_({ ok: false, error: 'That phone number looks too short — mind checking it?' });
  if (CONFIG.meetingTypes.indexOf(type) === -1)
    return json_({ ok: false, error: 'Please pick a meeting type.' });
  if (CONFIG.services.indexOf(service) === -1)
    return json_({ ok: false, error: 'Please pick a service from the list.' });

  var start = parseNz_(date, time);
  if (!start || freeSlots_(date).indexOf(time) === -1)
    return json_({ ok: false, error: 'That time isn\'t available any more — please pick another slot.' });

  var end = new Date(start.getTime() + CONFIG.slotMinutes * 60000);

  // ---- Book inside the lock: re-check, then write ----
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000))
    return json_({ ok: false, error: 'The calendar is busy right now — give it a few seconds and try again.' });

  try {
    if (freeSlots_(date).indexOf(time) === -1)
      return json_({ ok: false, error: 'Ah — that slot was just taken. Please pick another time.' });

    var isOnline = type === 'Online video call';
    var where = CONFIG.address;

    if (isOnline) {
      where = createMeetEvent_(name, email, service, start, end) || 'Meet link will follow by email';
    } else {
      CalendarApp.getDefaultCalendar().createEvent(
        'Nova consult — ' + name + ' (' + service + ')', start, end,
        { location: CONFIG.address, description: bookingSummary_(name, email, phone, company, service, about) }
      );
    }

    sheet_().appendRow([
      new Date(), name, email, phone, type, service, company, about,
      start, end, where, 'New', '', '', false, false
    ]);

    // Email failure must never lose a booking — the row + event already exist.
    var emailSent = true;
    try { sendEmail_(email, confirmationEmail_(name, type, start, where, service)); }
    catch (err) { emailSent = false; }

    return json_({
      ok: true,
      booking: {
        name: name, type: type, service: service,
        when: nzFormat_(start), where: where, emailSent: emailSent
      }
    });
  } finally {
    lock.releaseLock();
  }
}


/* ============================ AVAILABILITY =============================== */

/** Per-day availability for a month, respecting the booking window. */
function monthAvailability_(year, month /* 1-based */) {
  var bookings = bookingsByDay_();
  var daysInMonth = new Date(year, month, 0).getDate();
  var days = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var key = pad_(year) + '-' + pad2_(month) + '-' + pad2_(d);
    days.push({ d: key, open: freeSlotsFromCache_(key, bookings).length > 0 });
  }
  return { ok: true, days: days };
}

/** Free 'HH:mm' starts for one date. */
function freeSlots_(dateStr) {
  return freeSlotsFromCache_(dateStr, bookingsByDay_());
}

function freeSlotsFromCache_(dateStr, bookingsByDay) {
  var parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return [];
  var probe = new Date(parts[0], parts[1] - 1, parts[2], 12, 0);
  if (CONFIG.openDays.indexOf(probe.getDay()) === -1) return [];

  var now = new Date();
  var earliest = new Date(now.getTime() + CONFIG.minNoticeHours * 3600000);
  var latest = new Date(now.getTime() + CONFIG.maxAheadDays * 86400000);

  var open = hm_(CONFIG.dayStart), close = hm_(CONFIG.dayEnd);
  var step = (CONFIG.slotMinutes + CONFIG.bufferMinutes) * 60000;
  var booked = bookingsByDay[dateStr] || [];

  var slots = [];
  var t = new Date(parts[0], parts[1] - 1, parts[2], open.h, open.m);
  var dayClose = new Date(parts[0], parts[1] - 1, parts[2], close.h, close.m);

  while (t.getTime() + CONFIG.slotMinutes * 60000 <= dayClose.getTime()) {
    var slotEnd = t.getTime() + CONFIG.slotMinutes * 60000;
    var clashes = booked.some(function (b) { return t.getTime() < b.end && slotEnd > b.start; });
    if (!clashes && t >= earliest && t <= latest) {
      slots.push(pad2_(t.getHours()) + ':' + pad2_(t.getMinutes()));
    }
    t = new Date(t.getTime() + step);
  }
  return slots;
}

/** One sheet read → { 'yyyy-MM-dd': [{start,end}, ...] } (buffer included). */
function bookingsByDay_() {
  var values = sheet_().getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var start = values[i][COL.START - 1];
    if (!(start instanceof Date)) continue;
    var key = Utilities.formatDate(start, TZ, 'yyyy-MM-dd');
    (map[key] = map[key] || []).push({
      start: start.getTime(),
      end: start.getTime() + (CONFIG.slotMinutes + CONFIG.bufferMinutes) * 60000
    });
  }
  return map;
}


/* ============================== CALENDAR ================================= */

/** Online meetings: Calendar API (advanced service) so we get a Meet link. */
function createMeetEvent_(name, email, service, start, end) {
  var event = Calendar.Events.insert({
    summary: 'Nova consult — ' + name + ' (' + service + ')',
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end:   { dateTime: end.toISOString(),   timeZone: TZ },
    attendees: [{ email: email }],
    conferenceData: {
      createRequest: {
        requestId: Utilities.getUuid(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }, 'primary', { conferenceDataVersion: 1, sendUpdates: 'none' });
  return event.hangoutLink || null;
}


/* ============================== REMINDERS ================================
 * Runs every 5 minutes (trigger installed by setup()). Sends anything due,
 * marks the flag immediately, and a lock stops overlapping runs.
 * ========================================================================= */
function scanReminders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // another run is mid-scan — skip

  try {
    var sh = sheet_();
    var values = sh.getDataRange().getValues();
    var now = Date.now();

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var start = row[COL.START - 1];
      if (!(start instanceof Date) || start.getTime() < now) continue;

      var msToGo = start.getTime() - now;
      var name = row[COL.NAME - 1], email = row[COL.EMAIL - 1];
      var type = row[COL.TYPE - 1], where = row[COL.WHERE - 1];

      if (!row[COL.R24 - 1] && msToGo <= 24 * 3600000) {
        sh.getRange(i + 1, COL.R24).setValue(true); // mark first — never double-send
        try { sendEmail_(email, reminder24Email_(name, type, start, where)); }
        catch (err) { Logger.log('24h reminder failed row ' + (i + 1) + ': ' + err); }
      }
      if (!row[COL.R30 - 1] && msToGo <= 30 * 60000) {
        sh.getRange(i + 1, COL.R30).setValue(true);
        try { sendEmail_(email, reminder30Email_(name, type, start, where)); }
        catch (err) { Logger.log('30m reminder failed row ' + (i + 1) + ': ' + err); }
      }
    }
  } finally {
    lock.releaseLock();
  }
}


/* ============================ EMAIL (RESEND) ============================= */

function sendEmail_(to, msg) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY missing from Script Properties');
  var from = props.getProperty('RESEND_FROM') || 'onboarding@resend.dev';

  var res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({
      from: CONFIG.fromName + ' <' + from + '>',
      to: [to],
      subject: msg.subject,
      html: msg.html
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300)
    throw new Error('Resend ' + res.getResponseCode() + ': ' + res.getContentText());
}

/* ---- Templates. Warm, short, from Kaushik — not from a system. ---- */

function emailShell_(inner) {
  return '<div style="background:#f6f5fb;padding:28px 14px;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8e6f2;">' +
    '<div style="background:#07060F;padding:18px 26px;">' +
      '<span style="color:#FBFAFF;font-size:19px;font-weight:700;letter-spacing:.01em;">Nova<span style="color:#45E1FF;">.</span></span>' +
    '</div>' +
    '<div style="padding:26px;color:#2b2740;font-size:15.5px;line-height:1.65;">' + inner + '</div>' +
    '<div style="padding:16px 26px;border-top:1px solid #eeecf6;color:#8b87a3;font-size:12.5px;">' +
      'Kaushik · Nova — websites &amp; AI video · Rolleston, New Zealand' +
    '</div>' +
  '</div></div>';
}

function detailCard_(rows) {
  var cells = rows.map(function (r) {
    return '<tr><td style="padding:7px 14px 7px 0;color:#8b87a3;font-size:12px;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;vertical-align:top;">' + r[0] + '</td>' +
           '<td style="padding:7px 0;color:#2b2740;font-weight:600;">' + r[1] + '</td></tr>';
  }).join('');
  return '<table style="margin:16px 0;padding:14px 18px;background:#f7f6fc;border-left:3px solid #7C4DFF;border-radius:0 10px 10px 0;width:100%;border-collapse:separate;">' + cells + '</table>';
}

function whereRow_(type, where) {
  return type === 'Online video call'
    ? ['Join link', '<a href="' + where + '" style="color:#7C4DFF;">' + where + '</a>']
    : ['Where', where + '<br><span style="font-weight:400;color:#8b87a3;">(easy street parking)</span>'];
}

function confirmationEmail_(name, type, start, where, service) {
  var first = String(name).split(' ')[0];
  return {
    subject: 'You’re booked, ' + first + ' — ' + Utilities.formatDate(start, TZ, 'EEEE d MMMM'),
    html: emailShell_(
      '<p style="margin:0 0 14px;">Hey ' + first + ',</p>' +
      '<p style="margin:0 0 14px;">You’re locked in — genuinely looking forward to this one. Here’s everything:</p>' +
      detailCard_([
        ['When', nzFormat_(start) + ' (NZ time)'],
        ['Meeting', type],
        whereRow_(type, where),
        ['About', service]
      ]) +
      '<p style="margin:0 0 14px;"><strong>Before we chat</strong>, it helps (but isn’t required) to have a think about:</p>' +
      '<ul style="margin:0 0 14px;padding-left:20px;">' +
        '<li style="margin-bottom:6px;">what you want people to <em>feel</em> when they find your business online</li>' +
        '<li style="margin-bottom:6px;">one or two websites or ads you’ve seen and loved</li>' +
        '<li>roughly when you’d like to launch</li>' +
      '</ul>' +
      '<p style="margin:0 0 14px;">No prep beyond that — bring questions, I’ll bring ideas.</p>' +
      '<p style="margin:0 0 4px;">Need to change the time? Just reply to this email.</p>' +
      '<p style="margin:18px 0 0;">Kaushik</p>'
    )
  };
}

function reminder24Email_(name, type, start, where) {
  var first = String(name).split(' ')[0];
  return {
    subject: 'Tomorrow at ' + Utilities.formatDate(start, TZ, 'h:mma').toLowerCase() + ' — looking forward to it',
    html: emailShell_(
      '<p style="margin:0 0 14px;">Hey ' + first + ',</p>' +
      '<p style="margin:0 0 14px;">Quick note — we’re on for <strong>tomorrow</strong>. Here are the details again so you don’t have to dig:</p>' +
      detailCard_([
        ['When', nzFormat_(start) + ' (NZ time)'],
        ['Meeting', type],
        whereRow_(type, where)
      ]) +
      '<p style="margin:0 0 14px;">If anything’s changed on your end, just reply and we’ll shuffle things — no drama.</p>' +
      '<p style="margin:0 0 0;">Otherwise — see you tomorrow!<br><br>Kaushik</p>'
    )
  };
}

function reminder30Email_(name, type, start, where) {
  var first = String(name).split(' ')[0];
  var isOnline = type === 'Online video call';
  return {
    subject: 'See you in about 30 minutes',
    html: emailShell_(
      '<p style="margin:0 0 14px;">Hey ' + first + ',</p>' +
      '<p style="margin:0 0 14px;">We’re on soon — <strong>' + Utilities.formatDate(start, TZ, 'h:mma').toLowerCase() + '</strong>.</p>' +
      (isOnline
        ? '<p style="margin:0 0 14px;">When you’re ready: <a href="' + where + '" style="color:#7C4DFF;font-weight:600;">join the video call here</a>. Camera on or off — whatever you’re comfortable with.</p>'
        : '<p style="margin:0 0 14px;">I’m at <strong>' + where + '</strong> — easy street parking, come straight to the door.</p>') +
      '<p style="margin:0 0 0;">Grab a coffee. See you shortly!<br><br>Kaushik</p>'
    )
  };
}


/* ================================ SETUP ==================================
 * Run once from the editor after pasting this project into a blank
 * Google Sheet's Apps Script. Builds both tabs + the reminder trigger.
 * ========================================================================= */
function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);

  // ---- Bookings tab ----
  var sh = ss.getSheetByName(CONFIG.sheetName) || ss.insertSheet(CONFIG.sheetName);
  sh.clear();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#14112A').setFontColor('#FBFAFF');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, HEADERS.length, 130);
  sh.setColumnWidth(COL.ABOUT, 260);
  sh.setColumnWidth(COL.WHERE, 220);
  sh.getRange(2, COL.START, 999, 2).setNumberFormat('ddd d mmm yyyy h:mm am/pm');

  // Stage dropdown + colour coding
  var stages = ['New', 'Confirmed', 'Met', 'Proposal Sent', 'Won', 'Lost'];
  var stageRange = sh.getRange(2, COL.STAGE, 999, 1);
  stageRange.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(stages, true).setAllowInvalid(false).build()
  );
  var colours = { 'New': '#DFF6FF', 'Confirmed': '#E9DFFF', 'Met': '#DFF5EC',
                  'Proposal Sent': '#FFF3D6', 'Won': '#D7F5D7', 'Lost': '#F3E0E6' };
  var rules = stages.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s).setBackground(colours[s]).setRanges([stageRange]).build();
  });
  sh.setConditionalFormatRules(rules);

  // ---- Dashboard tab ----
  var dash = ss.getSheetByName(CONFIG.dashName) || ss.insertSheet(CONFIG.dashName);
  dash.clear();
  dash.getRange('A1').setValue('NOVA — PIPELINE AT A GLANCE')
    .setFontWeight('bold').setFontSize(14);
  dash.getRange('A3').setValue('Bookings this week');
  dash.getRange('B3').setFormula(
    '=COUNTIFS(Bookings!I:I,">="&(TODAY()-WEEKDAY(TODAY(),2)+1),Bookings!I:I,"<"&(TODAY()-WEEKDAY(TODAY(),2)+8))');
  dash.getRange('A5').setValue('By stage');
  stages.forEach(function (s, i) {
    dash.getRange(6 + i, 1).setValue(s);
    dash.getRange(6 + i, 2).setFormula('=COUNTIF(Bookings!L:L,"' + s + '")');
  });
  dash.getRange('D3').setValue('Next 10 meetings');
  dash.getRange('D4').setFormula(
    '=IFERROR(QUERY(Bookings!B:K,"select B, I, E, K where I >= now() order by I asc limit 10 label B \'\', I \'\', E \'\', K \'\'"),"Nothing booked yet")');
  dash.getRange('A3:A20').setFontWeight('bold');
  dash.setColumnWidths(4, 4, 180);

  // ---- Reminder trigger (every 5 minutes), created once ----
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'scanReminders';
  });
  if (!exists) ScriptApp.newTrigger('scanReminders').timeBased().everyMinutes(5).create();

  return 'Setup complete: tabs built, trigger installed.';
}


/* ================================ HELPERS ================================ */

function sheet_() {
  return SpreadsheetApp.getActive().getSheetByName(CONFIG.sheetName);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function hm_(s) { var p = s.split(':'); return { h: Number(p[0]), m: Number(p[1]) }; }
function pad_(n) { return String(n); }
function pad2_(n) { return ('0' + n).slice(-2); }

function parseNz_(dateStr, timeStr) {
  var d = String(dateStr).split('-').map(Number);
  var t = String(timeStr).split(':').map(Number);
  if (d.length !== 3 || t.length !== 2 || isNaN(d[0]) || isNaN(t[0])) return null;
  return new Date(d[0], d[1] - 1, d[2], t[0], t[1]); // script TZ = Pacific/Auckland
}

function nzFormat_(d) {
  return Utilities.formatDate(d, TZ, "EEEE d MMMM yyyy 'at' h:mma")
    .replace(/AM$/, 'am').replace(/PM$/, 'pm');
}

function bookingSummary_(name, email, phone, company, service, about) {
  return 'Client: ' + name + '\nEmail: ' + email + '\nPhone: ' + phone +
    '\nCompany: ' + company + '\nService: ' + service + '\n\nAbout:\n' + about;
}
