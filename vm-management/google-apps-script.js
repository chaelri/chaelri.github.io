/**
 * Google Apps Script — Volunteer Time Management → Google Sheets Sync
 *
 * SETUP:
 * 1. Open your Google Sheet
 * 2. Extensions > Apps Script
 * 3. Paste this entire code (replace any existing code)
 * 4. Click Deploy > New Deployment
 * 5. Type: Web App
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. Copy the deployment URL and paste it into monitor.js
 */

const SHEET_ID = '1-6X2Qf7pMd2J_kBcH2_IxNjkuyaw_3ei629XG6YpHhE';

// Column headers for the Logs sheet
const HEADERS = [
  'Date', 'Log Key', 'Volunteer ID', 'Name', 'Segment', 'Role',
  'Comms Code', 'Seg ID', 'Time In', 'Time Out', 'Duration (min)',
  'Status'
];

/**
 * Initialize sheet with headers and formatting on first run.
 */
function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Logs');
  if (!sheet) {
    sheet = ss.insertSheet('Logs');
  }

  // Set headers
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setValues([HEADERS]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a1a1a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontFamily('Inter');
  headerRange.setFontSize(9);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  // Set column widths
  const widths = [100, 120, 180, 160, 90, 200, 80, 60, 90, 90, 90, 80];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Add filter
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  }

  // Hide Log Key (B) and Volunteer ID (C) columns — needed internally but not for viewing
  sheet.hideColumns(2, 2);

  // Setup Dashboard sheet
  setupDashboard(ss);

  SpreadsheetApp.flush();
}

/**
 * Create a Dashboard sheet with today's summary.
 */
function setupDashboard(ss) {
  let dash = ss.getSheetByName('Dashboard');
  if (!dash) {
    dash = ss.insertSheet('Dashboard', 0);
  }

  dash.clear();

  // Title
  dash.getRange('A1').setValue('Live Production — Volunteer Dashboard');
  dash.getRange('A1:F1').merge().setFontSize(14).setFontWeight('bold')
    .setFontFamily('Inter').setBackground('#171717').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  dash.setRowHeight(1, 48);

  // Today's date
  dash.getRange('A2').setValue('Last Updated:');
  dash.getRange('B2').setFormula('=TEXT(NOW(),"ddd, mmm d, yyyy h:mm AM/PM")');
  dash.getRange('A2:B2').setFontSize(9).setFontColor('#999999').setFontFamily('Inter');

  // Summary formulas (row 4+)
  const today = 'TEXT(TODAY(),"yyyy-mm-dd")';

  dash.getRange('A4').setValue('TODAY\'S SUMMARY').setFontWeight('bold').setFontSize(10).setFontFamily('Inter');
  dash.getRange('A4:F4').merge().setBackground('#f5f5f5');

  const summaryLabels = [
    ['Total Volunteers', `=COUNTIF(Logs!A:A,${today})`],
    ['Currently Active', `=COUNTIFS(Logs!A:A,${today},Logs!L:L,"Active")`],
    ['Completed', `=COUNTIFS(Logs!A:A,${today},Logs!L:L,"Completed")`],
    ['Avg Duration (min)', `=IFERROR(ROUND(AVERAGEIFS(Logs!K:K,Logs!A:A,${today},Logs!L:L,"Completed"),0),"—")`],
  ];

  summaryLabels.forEach((row, i) => {
    const r = 5 + i;
    dash.getRange(r, 1).setValue(row[0]).setFontSize(10).setFontFamily('Inter').setFontColor('#666666');
    dash.getRange(r, 2).setFormula(row[1]).setFontSize(16).setFontWeight('bold').setFontFamily('Inter').setFontColor('#171717').setHorizontalAlignment('center');
  });

  // Segment breakdown
  dash.getRange('A10').setValue('BY SEGMENT').setFontWeight('bold').setFontSize(10).setFontFamily('Inter');
  dash.getRange('A10:F10').merge().setBackground('#f5f5f5');

  const segments = ['Audio', 'Lights', 'Camera', 'Stage', 'Graphics', 'Live Prod Crew', 'Comms'];
  segments.forEach((seg, i) => {
    const r = 11 + i;
    dash.getRange(r, 1).setValue(seg).setFontSize(9).setFontFamily('Inter').setFontColor('#666666');
    dash.getRange(r, 2).setFormula(`=COUNTIFS(Logs!A:A,${today},Logs!E:E,"${seg}")`).setFontSize(12).setFontWeight('bold').setFontFamily('Inter').setHorizontalAlignment('center');
    dash.getRange(r, 3).setFormula(`=COUNTIFS(Logs!A:A,${today},Logs!E:E,"${seg}",Logs!L:L,"Active")`).setFontSize(9).setFontFamily('Inter').setFontColor('#22c55e').setHorizontalAlignment('center');
    dash.getRange(r, 4).setValue('active').setFontSize(8).setFontFamily('Inter').setFontColor('#999999');
  });

  // Column widths
  dash.setColumnWidth(1, 180);
  dash.setColumnWidth(2, 80);
  dash.setColumnWidth(3, 60);
  dash.setColumnWidth(4, 60);

  // Today's log preview (row 20+)
  dash.getRange('A19').setValue('TODAY\'S LOG PREVIEW').setFontWeight('bold').setFontSize(10).setFontFamily('Inter');
  dash.getRange('A19:F19').merge().setBackground('#f5f5f5');

  const previewHeaders = ['Name', 'Segment', 'Role', 'Comms', 'Time In', 'Status'];
  const headerRow = dash.getRange(20, 1, 1, previewHeaders.length);
  headerRow.setValues([previewHeaders]);
  headerRow.setFontWeight('bold').setFontSize(9).setFontFamily('Inter')
    .setBackground('#262626').setFontColor('#ffffff');

  // Use QUERY to pull today's entries (date literal comparison)
  dash.getRange('A21').setFormula(
    `=IFERROR(QUERY(Logs!A:L,"SELECT D,E,F,G,I,L WHERE A = date '"&TEXT(TODAY(),"yyyy-mm-dd")&"' ORDER BY I DESC",0),"No entries yet")`
  );

  dash.setFrozenRows(0);
}

/**
 * Handle POST requests from the monitor app.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('Logs');
    if (!sheet) {
      setupSheet();
      sheet = ss.getSheetByName('Logs');
    }

    if (action === 'timeIn') {
      return handleTimeIn(sheet, data);
    } else if (action === 'timeOut') {
      return handleTimeOut(sheet, data);
    } else if (action === 'bulkSync') {
      return handleBulkSync(sheet, data);
    }

    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

/**
 * Handle time-in: append a new row.
 */
function handleTimeIn(sheet, data) {
  const timeInPH = formatToPH(data.timeIn);
  const datePH = data.date || timeInPH.split(' ')[0];

  const row = [
    datePH,                          // Date
    data.logKey || '',               // Log Key
    data.volunteerId || '',          // Volunteer ID
    data.name || '',                 // Name
    data.segment || '',              // Segment
    data.role || '',                 // Role
    data.commsId || '',              // Comms Code
    data.numberedId || '',           // Seg ID
    timeInPH,                        // Time In (PH)
    '',                              // Time Out
    '',                              // Duration
    'Active',                        // Status
  ];

  sheet.appendRow(row);

  // Format the new row
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(lastRow, 1, 1, HEADERS.length);
  range.setFontFamily('Inter');
  range.setFontSize(9);
  range.setVerticalAlignment('middle');

  // Green highlight for active
  sheet.getRange(lastRow, HEADERS.length).setFontColor('#16a34a').setFontWeight('bold');

  // Bold name
  sheet.getRange(lastRow, 4).setFontWeight('bold');

  return jsonResponse({ success: true, action: 'timeIn', row: lastRow });
}

/**
 * Handle time-out: find existing row by logKey and update.
 */
function handleTimeOut(sheet, data) {
  const logKey = data.logKey;
  if (!logKey) return jsonResponse({ success: false, error: 'Missing logKey' });

  // Find the row with this logKey (column B = index 2)
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === logKey) {
      targetRow = i + 1; // 1-indexed
      break;
    }
  }

  if (targetRow === -1) {
    return jsonResponse({ success: false, error: 'Log key not found: ' + logKey });
  }

  const timeOutPH = formatToPH(data.timeOut);

  // Calculate duration in minutes
  const timeInStr = sheet.getRange(targetRow, 9).getValue();
  let durationMin = '';
  if (timeInStr && data.timeIn) {
    const diffMs = new Date(data.timeOut).getTime() - new Date(data.timeIn).getTime();
    durationMin = Math.round(diffMs / 60000);
  }

  // Update Time Out, Duration, Status
  sheet.getRange(targetRow, 10).setValue(timeOutPH);           // Time Out
  sheet.getRange(targetRow, 11).setValue(durationMin);          // Duration
  sheet.getRange(targetRow, 12).setValue('Completed')           // Status
    .setFontColor('#737373').setFontWeight('normal');

  // Dim the completed row
  const rowRange = sheet.getRange(targetRow, 1, 1, HEADERS.length);
  rowRange.setFontColor('#a3a3a3');
  sheet.getRange(targetRow, 4).setFontWeight('normal');

  return jsonResponse({ success: true, action: 'timeOut', row: targetRow, duration: durationMin });
}

/**
 * Handle bulk sync: receives all logs and rebuilds the sheet.
 * Deduplicates by logKey — existing rows are updated, new ones are appended.
 */
function handleBulkSync(sheet, data) {
  const logs = data.logs || [];
  if (!logs.length) return jsonResponse({ success: true, synced: 0 });

  // Build map of existing logKeys → row numbers
  const existingData = sheet.getDataRange().getValues();
  const keyToRow = {};
  for (let i = 1; i < existingData.length; i++) {
    if (existingData[i][1]) keyToRow[existingData[i][1]] = i + 1;
  }

  let added = 0, updated = 0;

  logs.forEach((log) => {
    const timeInPH = formatToPH(log.timeIn);
    const timeOutPH = formatToPH(log.timeOut);
    const datePH = log.date || (timeInPH ? timeInPH.split(' ')[0] : '');

    // Calculate duration
    let durationMin = '';
    if (log.timeIn && log.timeOut) {
      const diffMs = new Date(log.timeOut).getTime() - new Date(log.timeIn).getTime();
      durationMin = Math.round(diffMs / 60000);
    }

    const status = log.timeOut ? 'Completed' : 'Active';
    const rowData = [
      datePH, log.key || '', log.volunteerId || '', log.name || '',
      log.segment || '', log.role || '', log.commsId || '',
      log.numberedId || '', timeInPH, timeOutPH, durationMin, status
    ];

    const existingRow = keyToRow[log.key];
    if (existingRow) {
      // Update existing row
      sheet.getRange(existingRow, 1, 1, HEADERS.length).setValues([rowData]);
      formatRow(sheet, existingRow, status);
      updated++;
    } else {
      // Append new row
      sheet.appendRow(rowData);
      const lastRow = sheet.getLastRow();
      formatRow(sheet, lastRow, status);
      added++;
    }
  });

  SpreadsheetApp.flush();
  return jsonResponse({ success: true, added: added, updated: updated, total: logs.length });
}

/**
 * Apply formatting to a row based on status.
 */
function formatRow(sheet, row, status) {
  const range = sheet.getRange(row, 1, 1, HEADERS.length);
  range.setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');

  if (status === 'Active') {
    range.setFontColor('#000000');
    sheet.getRange(row, 4).setFontWeight('bold');
    sheet.getRange(row, HEADERS.length).setFontColor('#16a34a').setFontWeight('bold');
  } else {
    range.setFontColor('#a3a3a3');
    sheet.getRange(row, 4).setFontWeight('normal');
    sheet.getRange(row, HEADERS.length).setFontColor('#737373').setFontWeight('normal');
  }
}

/**
 * Convert ISO timestamp to Philippine time string.
 */
function formatToPH(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return Utilities.formatDate(d, 'Asia/Manila', 'yyyy-MM-dd HH:mm');
}

/**
 * Return JSON response.
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * GET handler — for testing the endpoint is live.
 */
function doGet() {
  return jsonResponse({ status: 'ok', message: 'Volunteer Time Management Sheets API is live.' });
}
