#!/usr/bin/env python3
"""
Oakcraft CRR Tracker - Data Build Pipeline
Extracts 100% real production data from the source Excel workbook into JSON
consumed by the static frontend. NO demo/synthetic data is ever generated.
"""
import openpyxl, json, re, os, datetime, hashlib
from collections import defaultdict, OrderedDict

SRC = os.environ.get('SRC_XLSX',
    '/root/.claude/uploads/1cc4046f-68bf-5cb7-b507-cfd12432360d/c47ce903-CRR_Calling_Data_Reprot.xlsx')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(OUT, exist_ok=True)

# Canonical field-name map: raw header -> normalized key
FIELD_MAP = {
    'Sr. No.': 'sr_no',
    'Customer Name': 'customer_name',
    'verified_business_type': 'verified_business_type',
    'what_they_do': 'what_they_do',
    'trade_evidence': 'trade_evidence',
    'state': 'state',
    'segment': 'segment',
    'Total Orders': 'total_orders',
    'Total Order Value (Rs.)': 'total_value',
    'aov': 'aov',
    'Last Order': 'last_order',
    'days_since': 'days_since',
    'likely_reason_gap_or_churn': 'gap_reason',
    'pitch_angle': 'pitch_angle',
    'recommended_action': 'recommended_action',
    'Phone No.': 'phone',
    'phone_on_file': 'phone_on_file',
    'confidence': 'confidence',
    'est_12m_upside': 'upside',
    'website_or_source': 'source_url',
    'GSTIN / UIN': 'gstin',
    'Address': 'address',
    'data_quality_flag': 'quality_flag',
    # sheet 13
    'Group': 'group',
    'Sr. Nos.': 'sr_nos',
    'Records': 'records',
    'Records in group': 'records_in_group',
    'Combined Value (Rs.)': 'combined_value',
    'State(s)': 'states',
    'GSTIN(s)': 'gstins',
    'Evidence / What To Do': 'evidence',
}

NUMERIC = {'total_orders','total_value','aov','days_since','upside','combined_value','records_in_group','sr_no'}
DATE_FIELDS = {'last_order'}

def norm_key(h):
    if h is None: return None
    h = str(h).strip()
    return FIELD_MAP.get(h, re.sub(r'[^a-z0-9]+','_', h.lower()).strip('_'))

def to_num(v):
    if v is None or v == '': return None
    if isinstance(v,(int,float)): return round(float(v),2)
    s = re.sub(r'[^0-9.\-]', '', str(v))
    if s in ('','-','.'): return None
    try: return round(float(s),2)
    except: return None

def to_date(v):
    if v is None or v == '': return None
    if isinstance(v,(datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m: return m.group(0)
    return s or None

def clean_str(v):
    if v is None: return ''
    s = str(v).replace('\xa0',' ').strip()
    return '' if s.lower() in ('none','nan','null') else s

PHONE_RE = re.compile(r'(\+?91)?[\s\-]?([6-9]\d{9})')
def parse_phones(raw):
    """Extract every valid Indian mobile from a raw phone cell. Real data only."""
    if not raw: return []
    out = []
    for part in re.split(r'[,/;|]| and ', str(raw)):
        digits = re.sub(r'\D','', part)
        if len(digits) > 10 and digits.startswith('91'): digits = digits[2:]
        if len(digits) > 10 and digits.startswith('0'): digits = digits.lstrip('0')
        if len(digits) == 10 and digits[0] in '6789':
            if digits not in out: out.append(digits)
        elif len(digits) in (11,12):
            m = PHONE_RE.search(digits)
            if m and m.group(2) not in out: out.append(m.group(2))
        elif 6 <= len(digits) <= 11 and digits not in out:
            out.append(digits)   # landline / short — keep as-is, never fabricate
    return out

def seg_code(segment):
    s = clean_str(segment)
    if not s: return ''
    m = re.match(r'^([A-Z])\.', s)
    return m.group(1) if m else ''

def seg_label(segment):
    s = clean_str(segment)
    if not s: return ''
    core = re.sub(r'^[A-Z]\.\s*', '', s)
    return core.split('—')[0].strip() or core[:40]

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

sheets = []
all_rows = []          # union of every account row (for global analytics)
for ws in wb.worksheets:
    rows_iter = ws.iter_rows(values_only=True)
    title_row = next(rows_iter)
    header_row = next(rows_iter)
    subtitle = clean_str(title_row[0])
    headers = [norm_key(h) for h in header_row]
    recs = []
    for r in rows_iter:
        if all(c is None or clean_str(c)=='' for c in r): continue
        rec = {}
        for k,v in zip(headers,r):
            if not k: continue
            if k in NUMERIC: rec[k] = to_num(v)
            elif k in DATE_FIELDS: rec[k] = to_date(v)
            else: rec[k] = clean_str(v)
        # derived, computed strictly from the real cells
        rec['phones'] = parse_phones(rec.get('phone',''))
        rec['has_phone'] = len(rec['phones']) > 0
        if 'segment' in rec:
            rec['seg_code'] = seg_code(rec.get('segment'))
            rec['seg_label'] = seg_label(rec.get('segment'))
        if rec.get('last_order'):
            rec['last_order_year'] = rec['last_order'][:4]
            rec['last_order_month'] = rec['last_order'][:7]
        recs.append(rec)

    sid = re.sub(r'[^a-z0-9]+','-', ws.title.lower()).strip('-')
    sheets.append(OrderedDict([
        ('id', sid),
        ('sheet_name', ws.title),
        ('code', ws.title.split(' ')[0]),
        ('title', ' '.join(ws.title.split(' ')[1:])),
        ('subtitle', subtitle),
        ('columns', [h for h in headers if h]),
        ('row_count', len(recs)),
        ('rows', recs),
    ]))
    if 'customer_name' in headers and 'total_value' in headers:
        for rec in recs:
            all_rows.append(dict(rec, _sheet=ws.title, _sheet_id=sid))

# ---------- Master customer index (dedupe across sheets by Sr. No.) -------------
master = OrderedDict()
SHEET_TAGS = {
  '02 CALL LIST - TOP 100':'Top 100','03 LAPSED BIG ACCOUNTS':'Lapsed Big',
  '04 DEALER & CHANNEL TARGETS':'Dealer','05 ARCHITECTS & INTERIORS':'Architect',
  '06 OTHER RESELLERS':'Reseller','07 INSTITUTIONS, GOVT & PSU':'Institution',
  '08 CORPORATES':'Corporate','09 ACTIVE REPEAT - PROTECT':'Champion',
  '10 ONE-TIME BUYERS':'One-Time','11 NEAR FACTORY - VISIT':'Near Factory',
  '12 NO PHONE ON FILE':'No Phone',
}
for r in all_rows:
    key = r.get('sr_no')
    if key is None:
        key = 'n_' + hashlib.md5(r.get('customer_name','').encode()).hexdigest()[:8]
    if key not in master:
        m = {k:v for k,v in r.items() if not k.startswith('_')}
        m['sr_no'] = r.get('sr_no')
        m['tags'] = []
        m['sheets'] = []
        master[key] = m
    else:
        m = master[key]
        for k,v in r.items():
            if k.startswith('_'): continue
            if (m.get(k) in (None,'',[]) ) and v not in (None,'',[]):
                m[k] = v
    tag = SHEET_TAGS.get(r['_sheet'])
    if tag and tag not in master[key]['tags']: master[key]['tags'].append(tag)
    if r['_sheet'] not in master[key]['sheets']: master[key]['sheets'].append(r['_sheet'])

customers = list(master.values())

# ---------- Analytics (all derived from real values) -------------
def s(v): return v if isinstance(v,(int,float)) else 0

customers.sort(key=lambda x: -s(x.get('total_value')))
tv = sum(s(c.get('total_value')) for c in customers)

# ABC / Pareto classification on real revenue
cum = 0
for c in customers:
    cum += s(c.get('total_value'))
    c['cum_share'] = round(cum/tv*100,3) if tv else 0
    c['abc'] = 'A' if c['cum_share'] <= 80 else ('B' if c['cum_share'] <= 95 else 'C')

# RFM using business-meaningful thresholds (ties in order counts make
# pure percentile banding collapse into empty columns)
def band_R(d):          # days since last order
    if d <= 30:  return 5
    if d <= 90:  return 4
    if d <= 180: return 3
    if d <= 365: return 2
    return 1
def band_F(n):          # number of orders
    if n >= 10: return 5
    if n >= 5:  return 4
    if n >= 3:  return 3
    if n >= 2:  return 2
    return 1
mvals = sorted(s(c.get('total_value')) for c in customers)
def q(p):
    if not mvals: return 0
    return mvals[min(len(mvals)-1, int(len(mvals)*p))]
M_CUTS = [q(.2), q(.4), q(.6), q(.8)]
def band_M(v):
    for i, cut in enumerate(M_CUTS):
        if v <= cut: return i+1
    return 5
for c in customers:
    R = band_R(s(c.get('days_since')))
    F = band_F(s(c.get('total_orders')))
    M = band_M(s(c.get('total_value')))
    c['R'],c['F'],c['M'] = R,F,M
    c['rfm'] = f'{R}{F}{M}'
    c['rfm_score'] = R+F+M
    d = s(c.get('days_since'))
    val = s(c.get('total_value'))
    # Churn risk: recency-weighted, scaled by monetary importance
    risk = min(100, (d/365)*60 + (0 if s(c.get('total_orders'))>1 else 20) + (20 if d>180 else 0))
    c['churn_risk'] = round(risk,1)
    c['risk_band'] = 'Critical' if risk>=70 else 'High' if risk>=45 else 'Medium' if risk>=25 else 'Low'
    c['value_at_risk'] = round(val * risk/100)

def rollup(key, items):
    d = defaultdict(lambda: {'count':0,'value':0.0,'orders':0,'upside':0.0})
    for c in items:
        k = clean_str(c.get(key)) or 'Unspecified'
        d[k]['count'] += 1
        d[k]['value'] += s(c.get('total_value'))
        d[k]['orders'] += s(c.get('total_orders'))
        d[k]['upside'] += s(c.get('upside'))
    return sorted([{'key':k, **{kk:round(vv,2) for kk,vv in v.items()}} for k,v in d.items()],
                  key=lambda x:-x['value'])

monthly = defaultdict(lambda: {'count':0,'value':0.0})
for c in customers:
    if c.get('last_order_month'):
        monthly[c['last_order_month']]['count'] += 1
        monthly[c['last_order_month']]['value'] += s(c.get('total_value'))

reco = defaultdict(lambda: {'count':0,'value':0.0,'upside':0.0})
for c in customers:
    k = clean_str(c.get('recommended_action'))
    if not k: continue
    reco[k]['count'] += 1; reco[k]['value'] += s(c.get('total_value')); reco[k]['upside'] += s(c.get('upside'))

recency_buckets = [('0-30',0,30),('31-60',31,60),('61-90',61,90),('91-180',91,180),
                   ('181-365',181,365),('365+',366,10**9)]
rb = []
for lab,lo,hi in recency_buckets:
    sel = [c for c in customers if lo <= s(c.get('days_since')) <= hi]
    rb.append({'key':lab,'count':len(sel),
               'value':round(sum(s(c.get('total_value')) for c in sel),2),
               'upside':round(sum(s(c.get('upside')) for c in sel),2)})

kpi = {
    'total_customers': len(customers),
    'total_value': round(tv,2),
    'total_orders': int(sum(s(c.get('total_orders')) for c in customers)),
    'total_upside': round(sum(s(c.get('upside')) for c in customers),2),
    'avg_aov': round(tv/max(1,sum(s(c.get('total_orders')) for c in customers)),2),
    'with_phone': sum(1 for c in customers if c.get('has_phone')),
    'no_phone': sum(1 for c in customers if not c.get('has_phone')),
    'states': len(set(clean_str(c.get('state')) for c in customers if clean_str(c.get('state')))),
    'value_at_risk': round(sum(c['value_at_risk'] for c in customers),2),
    'critical_risk': sum(1 for c in customers if c['risk_band']=='Critical'),
    'a_class': sum(1 for c in customers if c['abc']=='A'),
    'repeat_customers': sum(1 for c in customers if s(c.get('total_orders'))>1),
    'one_time': sum(1 for c in customers if s(c.get('total_orders'))==1),
    'active_90d': sum(1 for c in customers if s(c.get('days_since'))<=90),
    'lapsed_180d': sum(1 for c in customers if s(c.get('days_since'))>180),
}

analytics = {
    'kpi': kpi,
    'by_state': rollup('state', customers),
    'by_segment': rollup('seg_label', customers),
    'by_business': rollup('verified_business_type', customers)[:40],
    'by_confidence': rollup('confidence', customers),
    'by_abc': rollup('abc', customers),
    'by_risk': rollup('risk_band', customers),
    'by_trade': rollup('trade_evidence', customers),
    'recency_buckets': rb,
    'monthly_last_order': sorted([{'key':k,'count':v['count'],'value':round(v['value'],2)}
                                   for k,v in monthly.items()], key=lambda x:x['key']),
    'recommended_actions': sorted([{'key':k,**{kk:round(vv,2) for kk,vv in v.items()}}
                                   for k,v in reco.items()], key=lambda x:-x['upside']),
    'top_by_value': [{'customer_name':c['customer_name'],'total_value':s(c.get('total_value')),
                      'state':c.get('state',''),'total_orders':s(c.get('total_orders'))}
                     for c in customers[:25]],
    'top_by_upside': [{'customer_name':c['customer_name'],'upside':s(c.get('upside')),
                       'state':c.get('state',''),'days_since':s(c.get('days_since'))}
                      for c in sorted(customers,key=lambda x:-s(x.get('upside')))[:25]],
    'top_at_risk': [{'customer_name':c['customer_name'],'value_at_risk':c['value_at_risk'],
                     'churn_risk':c['churn_risk'],'days_since':s(c.get('days_since')),
                     'total_value':s(c.get('total_value'))}
                    for c in sorted(customers,key=lambda x:-x['value_at_risk'])[:25]],
}

meta = {
    'source_file': os.path.basename(SRC),
    'generated_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'sheet_count': len(sheets),
    'total_source_rows': sum(sh['row_count'] for sh in sheets),
    'unique_customers': len(customers),
    'data_policy': 'All values are verbatim from the source workbook. No synthetic or demo data.',
    'modules': [{'id':sh['id'],'code':sh['code'],'sheet_name':sh['sheet_name'],
                 'title':sh['title'],'subtitle':sh['subtitle'],'row_count':sh['row_count'],
                 'columns':sh['columns']} for sh in sheets],
}

with open(f'{OUT}/meta.json','w',encoding='utf-8') as f: json.dump(meta,f,ensure_ascii=False,separators=(',',':'))
with open(f'{OUT}/analytics.json','w',encoding='utf-8') as f: json.dump(analytics,f,ensure_ascii=False,separators=(',',':'))
with open(f'{OUT}/customers.json','w',encoding='utf-8') as f: json.dump(customers,f,ensure_ascii=False,separators=(',',':'))
for sh in sheets:
    with open(f'{OUT}/module-{sh["id"]}.json','w',encoding='utf-8') as f:
        json.dump(sh,f,ensure_ascii=False,separators=(',',':'))

print(json.dumps({'sheets':len(sheets),'source_rows':meta['total_source_rows'],
                  'unique_customers':len(customers),'total_value':kpi['total_value'],
                  'total_orders':kpi['total_orders'],'total_upside':kpi['total_upside'],
                  'states':kpi['states'],'with_phone':kpi['with_phone']}, indent=2))

# ---------- Emit JS wrappers so the app also runs from file:// (no server) -----
import glob
js_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
for p in sorted(glob.glob(f'{js_dir}/*.json')):
    name = os.path.basename(p)[:-5]
    with open(p, encoding='utf-8') as f: payload = f.read()
    var = re.sub(r'[^a-zA-Z0-9]', '_', name)
    with open(f'{js_dir}/{name}.js', 'w', encoding='utf-8') as f:
        f.write('window.OAK=window.OAK||{};window.OAK.raw=window.OAK.raw||{};')
        f.write(f'window.OAK.raw["{name}"]={payload};')
        f.write(f'if(window.OAK.onData)window.OAK.onData("{name}");')
print('JS wrappers written:', len(glob.glob(f'{js_dir}/*.js')))
