/*******************************************************************
 * OAKCRAFT CRR TRACKER — GOOGLE SHEETS BACKEND
 * Google Apps Script Web App. Stores every call / WhatsApp / visit
 * logged in the frontend into a Google Sheet, and serves it back.
 *
 * SETUP
 * -----
 * 1.  Create a new Google Sheet. Name it e.g. "Oakcraft CRR Tracker".
 * 2.  Extensions > Apps Script. Delete the sample code.
 * 3.  Paste this entire file. Save.
 * 4.  Run the function `setup` once and grant permissions.
 * 5.  Deploy > New deployment > type "Web app"
 *       Execute as        : Me
 *       Who has access    : Anyone
 *     Deploy, then copy the /exec URL.
 * 6.  Paste that URL into js/config.js -> CONFIG.apiUrl
 *     and keep CONFIG.apiKey identical to API_KEY below.
 *
 * Re-deploy (Manage deployments > Edit > New version) after any edit.
 *******************************************************************/

var API_KEY    = 'OAKCRAFT-CRR-2026';   // must match CONFIG.apiKey in js/config.js
var LOG_SHEET  = 'Activity Log';
var CUST_SHEET = 'Customer Status';
var SUM_SHEET  = 'Summary';

/* Daily report — who "Share Report" may send to when the WhatsApp Cloud
   API is configured. Kept HERE, not taken from the browser, so nobody
   holding the public apiKey can use this script to message other numbers. */
var REPORT_TO  = ['918700545550', '917210876636'];

var HEADERS = ['ID','Timestamp','Date','Customer Name','Sr No','Type','Disposition',
               'Phone','Expected Value','Follow-up Date','Agent','Note','State','Segment',
               'Customer Total Value','Logged At (IST)',
               /* audit trail — the log is append-only, nothing is ever deleted */
               'Seq','Closes Follow-up','Voids Entry','Voided','Void Reason','Voided By'];

/* ---------------- Helpers ---------------- */
function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers){
  var s = ss_().getSheetByName(name);
  if(!s){
    s = ss_().insertSheet(name);
    if(headers){
      s.getRange(1,1,1,headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#1c2537').setFontColor('#f0a830');
      s.setFrozenRows(1);
      s.getRange(1,1,1,headers.length).createFilter?0:0;
    }
  } else if(headers){
    /* A sheet created by an older version is widened in place. Only the
       header row is touched — no logged row is ever rewritten or removed. */
    if(s.getMaxColumns() < headers.length)
      s.insertColumnsAfter(s.getMaxColumns(), headers.length - s.getMaxColumns());
    var have = s.getRange(1,1,1,headers.length).getValues()[0];
    var short = false, i;
    for(i=0;i<headers.length;i++){ if(String(have[i]||'') !== headers[i]){ short = true; break; } }
    if(short){
      s.getRange(1,1,1,headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#1c2537').setFontColor('#f0a830');
    }
  }
  return s;
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function auth_(key){ return key === API_KEY; }

function istNow_(){
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
}

function rowFrom_(a){
  return [
    a.id || '', a.ts || new Date().toISOString(), (a.ts||'').slice(0,10),
    a.customer_name || '', a.sr_no == null ? '' : a.sr_no,
    a.type || '', a.disposition || '', a.phone || '',
    a.value || 0, a.followup || '', a.agent || '',
    a.note || '', a.state || '', a.segment || '',
    a.total_value || 0, istNow_(),
    a.seq == null ? '' : a.seq, a.closes || '', a.voids || '',
    a.voided ? 'YES' : '', a.void_reason || '', a.voided_by || ''
  ];
}

/* ---------------- One-time setup ---------------- */
function setup(){
  var log = sheet_(LOG_SHEET, HEADERS);
  log.setColumnWidth(1,110); log.setColumnWidth(4,240); log.setColumnWidth(12,340);
  sheet_(CUST_SHEET, ['Customer Name','Sr No','Current Status','Owner','Last Contacted',
                      'Next Follow-up','Total Activities','Expected Pipeline','Notes']);
  sheet_(SUM_SHEET,  ['Metric','Value','Updated']);
  refreshSummary();
  SpreadsheetApp.getUi && SpreadsheetApp.getActive().toast('Oakcraft CRR backend is ready.');
  return 'Setup complete — now deploy as a Web App.';
}

/* ---------------- Write endpoint ---------------- */
function doPost(e){
  try{
    var body = JSON.parse(e.postData.contents);
    if(!auth_(body.key)) return json_({ok:false, error:'Unauthorized'});
    var log = sheet_(LOG_SHEET, HEADERS);

    if(body.action === 'log'){
      var a = body.payload;
      if(dupe_(log, a.id)) return json_({ok:true, duplicate:true});
      log.appendRow(rowFrom_(a));
      touchCustomer_(a);
      return json_({ok:true, id:a.id});
    }

    if(body.action === 'bulk'){
      var list = body.payload || [];
      var existing = idSet_(log);
      var rows = [];
      list.forEach(function(a){
        if(a.id && existing[a.id]) return;
        rows.push(rowFrom_(a)); touchCustomer_(a);
      });
      if(rows.length) log.getRange(log.getLastRow()+1, 1, rows.length, HEADERS.length).setValues(rows);
      return json_({ok:true, inserted:rows.length, skipped:list.length-rows.length});
    }

    if(body.action === 'status'){
      var p = body.payload;
      setStatus_(p.customer_name, p.sr_no, p.status, p.owner, p.notes);
      return json_({ok:true});
    }

    if(body.action === 'sendReport') return json_(sendReport_(body.payload || {}));

    return json_({ok:false, error:'Unknown action'});
  }catch(err){
    return json_({ok:false, error:String(err)});
  }
}

/* ---------------- Read endpoint ---------------- */
function doGet(e){
  try{
    var p = e.parameter || {};
    if(!auth_(p.key)) return json_({ok:false, error:'Unauthorized'});

    if(p.action === 'ping') return json_({ok:true, time:istNow_()});

    if(p.action === 'list'){
      var log = sheet_(LOG_SHEET, HEADERS);
      var last = log.getLastRow();
      if(last < 2) return json_({ok:true, rows:[]});
      var vals = log.getRange(2,1,last-1,HEADERS.length).getValues();
      var rows = vals.map(function(r){
        return { id:String(r[0]), ts:String(r[1]), customer_name:r[3], sr_no:r[4],
                 type:r[5], disposition:r[6], phone:String(r[7]), value:Number(r[8])||0,
                 followup:r[9]?Utilities.formatDate(new Date(r[9]),'Asia/Kolkata','yyyy-MM-dd'):'',
                 agent:r[10], note:r[11], state:r[12], segment:r[13],
                 total_value:Number(r[14])||0,
                 seq:Number(r[16])||undefined, closes:String(r[17]||''), voids:String(r[18]||''),
                 voided:String(r[19]||'')==='YES', void_reason:String(r[20]||''),
                 voided_by:String(r[21]||'') };
      });
      return json_({ok:true, rows:rows, count:rows.length});
    }

    if(p.action === 'summary'){ refreshSummary(); return json_({ok:true, summary:summary_()}); }

    return json_({ok:true, service:'Oakcraft CRR Tracker backend', time:istNow_()});
  }catch(err){
    return json_({ok:false, error:String(err)});
  }
}

/* ---------------- Internal ---------------- */
function idSet_(sh){
  var last = sh.getLastRow(); var m = {};
  if(last < 2) return m;
  sh.getRange(2,1,last-1,1).getValues().forEach(function(r){ if(r[0]) m[String(r[0])] = true; });
  return m;
}
function dupe_(sh, id){ return id ? !!idSet_(sh)[id] : false; }

function touchCustomer_(a){
  if(!a.customer_name) return;
  var s = sheet_(CUST_SHEET, ['Customer Name','Sr No','Current Status','Owner','Last Contacted',
                              'Next Follow-up','Total Activities','Expected Pipeline','Notes']);
  var last = s.getLastRow();
  var names = last > 1 ? s.getRange(2,1,last-1,1).getValues().map(function(r){return String(r[0]);}) : [];
  var i = names.indexOf(String(a.customer_name));
  if(i === -1){
    s.appendRow([a.customer_name, a.sr_no==null?'':a.sr_no, a.disposition||'', a.agent||'',
                 istNow_(), a.followup||'', 1, a.value||0, a.note||'']);
  } else {
    var row = i + 2;
    s.getRange(row,3).setValue(a.disposition||'');
    s.getRange(row,4).setValue(a.agent||'');
    s.getRange(row,5).setValue(istNow_());
    if(a.followup) s.getRange(row,6).setValue(a.followup);
    s.getRange(row,7).setValue((Number(s.getRange(row,7).getValue())||0) + 1);
    s.getRange(row,8).setValue((Number(s.getRange(row,8).getValue())||0) + (Number(a.value)||0));
    if(a.note) s.getRange(row,9).setValue(a.note);
  }
}

function setStatus_(name, sr, status, owner, notes){
  var s = sheet_(CUST_SHEET);
  var last = s.getLastRow();
  var names = last > 1 ? s.getRange(2,1,last-1,1).getValues().map(function(r){return String(r[0]);}) : [];
  var i = names.indexOf(String(name));
  if(i === -1) s.appendRow([name, sr==null?'':sr, status||'', owner||'', istNow_(), '', 0, 0, notes||'']);
  else {
    var row = i + 2;
    if(status) s.getRange(row,3).setValue(status);
    if(owner)  s.getRange(row,4).setValue(owner);
    if(notes)  s.getRange(row,9).setValue(notes);
  }
}

function summary_(){
  var log = sheet_(LOG_SHEET, HEADERS);
  var last = log.getLastRow();
  if(last < 2) return {total:0};
  var v = log.getRange(2,1,last-1,HEADERS.length).getValues();
  var today = Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');
  var pos = ['Connected — Interested','Connected — Order Expected','Visit Scheduled',
             'Quotation Sent','Connected — Follow-up'];
  var s = {total:v.length, today:0, connected:0, positive:0, whatsapp:0, pipeline:0};
  v.forEach(function(r){
    if(String(r[2]) === today || String(r[1]).slice(0,10) === today) s.today++;
    if(String(r[6]).indexOf('Connected') === 0) s.connected++;
    if(pos.indexOf(String(r[6])) > -1) s.positive++;
    if(String(r[5]) === 'whatsapp') s.whatsapp++;
    s.pipeline += Number(r[8]) || 0;
  });
  return s;
}

function refreshSummary(){
  var s = sheet_(SUM_SHEET, ['Metric','Value','Updated']);
  var d = summary_(), now = istNow_();
  var rows = [
    ['Total Activities',      d.total     || 0, now],
    ['Logged Today',          d.today     || 0, now],
    ['Connected Calls',       d.connected || 0, now],
    ['Positive Outcomes',     d.positive  || 0, now],
    ['WhatsApp Messages',     d.whatsapp  || 0, now],
    ['Pipeline Logged (Rs.)', d.pipeline  || 0, now],
    ['Connect Rate %',  d.total ? Math.round(d.connected / d.total * 100) : 0, now],
    ['Positive Rate %', d.total ? Math.round(d.positive  / d.total * 100) : 0, now]
  ];
  s.getRange(2,1,rows.length,3).setValues(rows);
}

/* ---------------- Daily report over WhatsApp Cloud API ----------------
   Optional. Lets "Share Report" deliver the PDF to REPORT_TO with no taps.
   Project Settings > Script properties:
     WA_TOKEN            permanent access token (Meta system user)
     WA_PHONE_NUMBER_ID  the sending number's Phone number ID
     WA_TEMPLATE         (recommended) approved template with a DOCUMENT
                         header — required whenever the recipient has not
                         messaged your business number in the last 24 h
     WA_TEMPLATE_LANG    template language code, default "en"
     WA_API_VERSION      Graph API version, default "v21.0"
   Then set report.autoSend: true in js/config.js and deploy a new version. */
function sendReport_(p){
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('WA_TOKEN'), phoneId = props.getProperty('WA_PHONE_NUMBER_ID');
  if(!token || !phoneId) return {ok:false, error:'WhatsApp Cloud API is not configured on the backend (WA_TOKEN / WA_PHONE_NUMBER_ID)'};
  if(!p.base64) return {ok:false, error:'No PDF received'};
  var ver = props.getProperty('WA_API_VERSION') || 'v21.0';
  var tpl = props.getProperty('WA_TEMPLATE'), lang = props.getProperty('WA_TEMPLATE_LANG') || 'en';
  var filename = String(p.filename || 'Daily-Calling-Report.pdf').replace(/[^\w.\-]+/g,'-');
  var base = 'https://graph.facebook.com/' + ver + '/' + phoneId;
  var auth = {Authorization: 'Bearer ' + token};

  var blob = Utilities.newBlob(Utilities.base64Decode(p.base64), 'application/pdf', filename);
  var up = UrlFetchApp.fetch(base + '/media', {method:'post', headers:auth, muteHttpExceptions:true,
    payload:{messaging_product:'whatsapp', type:'application/pdf', file:blob}});
  var media = JSON.parse(up.getContentText() || '{}');
  if(!media.id) return {ok:false, error:'Media upload failed: ' + up.getContentText().slice(0,300)};

  var sent = 0, errors = [];
  REPORT_TO.forEach(function(to){
    var msg = tpl
      ? {messaging_product:'whatsapp', to:to, type:'template', template:{name:tpl, language:{code:lang},
          components:[{type:'header', parameters:[{type:'document', document:{id:media.id, filename:filename}}]}]}}
      : {messaging_product:'whatsapp', to:to, type:'document',
          document:{id:media.id, filename:filename, caption:String(p.caption || '').slice(0,1000)}};
    var r = UrlFetchApp.fetch(base + '/messages', {method:'post', contentType:'application/json',
      headers:auth, payload:JSON.stringify(msg), muteHttpExceptions:true});
    var res = JSON.parse(r.getContentText() || '{}');
    if(res.messages && res.messages.length) sent++;
    else errors.push(to + ': ' + ((res.error && res.error.message) || r.getResponseCode()));
  });
  return sent === REPORT_TO.length ? {ok:true, sent:sent}
    : {ok:false, sent:sent, error:errors.join('; ')};
}

/* Optional: install a 15-minute trigger that keeps the Summary tab fresh */
function installTriggers(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'refreshSummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshSummary').timeBased().everyMinutes(15).create();
  return 'Summary refresh trigger installed.';
}
