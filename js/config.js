/* ============================================================
   OAKCRAFT CRR TRACKER — CONFIGURATION
   Edit this file after deploying the Google Apps Script backend.
   ============================================================ */
window.OAK = window.OAK || {};
window.OAK.CONFIG = {
  appName: 'Oakcraft CRR Tracker',
  orgName: 'Oakcraft',
  version: '1.0.0',

  /* ---- GOOGLE SHEETS BACKEND ----------------------------------
     1. Open backend/Code.gs, paste into a new Apps Script project
     2. Deploy > New deployment > Web app > Execute as "Me",
        Access "Anyone"
     3. Copy the /exec URL below. Leave blank to run offline
        (all activity is still saved in this browser).            */
  apiUrl: '',
  apiKey: 'OAKCRAFT-CRR-2026',
  /* how often to ask the sheet what the rest of the team has logged */
  syncIntervalSec: 45,

  /* ---- WHATSAPP ------------------------------------------------ */
  countryCode: '91',
  waTemplates: [
    { id: 'intro', name: 'Introduction', body:
      'Hello {name}, this is {agent} from Oakcraft (office chairs & furniture manufacturer, Bawana Delhi). We noticed you have ordered with us before. May I share our latest catalogue and pricing?' },
    { id: 'winback', name: 'Win-back', body:
      'Hello {name}, {agent} from Oakcraft here. Your last order with us was on {last_order}. We have new models and updated trade pricing — can I send you the list?' },
    { id: 'dealer', name: 'Dealer / Trade Price List', body:
      'Hello {name}, {agent} from Oakcraft (manufacturer, HSN 9401/9403). You are buying at retail — we can move you to dealer terms. Shall I send the dealer price list?' },
    { id: 'visit', name: 'Factory Visit', body:
      'Hello {name}, {agent} from Oakcraft. We are in the Bawana/Poothkhurd belt, very close to you. Can I visit your office this week with samples?' },
    { id: 'tender', name: 'Tender / GeM', body:
      'Hello {name}, {agent} from Oakcraft. We are a Micro MSE and the OEM for office seating, eligible for MSE purchase preference on GeM. May I share our GeM catalogue and credentials?' },
    { id: 'catalogue', name: 'Send Catalogue', body:
      'Hello {name}, {agent} from Oakcraft. Sharing our latest office furniture catalogue. Please let me know if any model interests you.' }
  ],
  defaultAgent: 'Oakcraft Sales',

  /* ---- CALL DISPOSITIONS --------------------------------------- */
  dispositions: [
    'Connected — Interested', 'Connected — Order Expected', 'Connected — Follow-up',
    'Connected — Not Interested', 'Connected — Price Issue', 'Connected — Already Sourcing',
    'No Answer', 'Wrong Number', 'Switched Off', 'Busy / Call Later',
    'Visit Scheduled', 'Catalogue Sent', 'Quotation Sent', 'WhatsApp Sent'
  ],
  positiveDispositions: ['Connected — Interested','Connected — Order Expected',
    'Visit Scheduled','Quotation Sent','Connected — Follow-up'],

  /* ---- MODULE SECTIONS ------------------------------------------
     Sheets listed here get no section in the sidebar. The data files
     stay in data/ and nothing is deleted — remove an id from this list
     to bring its section straight back.                              */
  hiddenModules: [
    '12-no-phone-on-file',
    '13-duplicates-shared-phones',
    '14-data-to-clean'
  ],

  currency: { symbol: '₹', locale: 'en-IN' },
  pageSize: 50
};
