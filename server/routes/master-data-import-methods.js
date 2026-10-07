import crypto from 'node:crypto';
import db from '../db/schema.js';
import { assertTenantScope } from '../lib/tenant.js';
import { getSetting, setSetting } from '../lib/settings.js';

const ESTABLISHMENT_TYPES = Object.freeze([
  { value: 'retail', label: 'متجر / تجزئة' },
  { value: 'supermarket', label: 'سوبر ماركت / بقالة' },
  { value: 'restaurant', label: 'مطعم' },
  { value: 'cafe', label: 'مقهى / كافيه' },
  { value: 'fast_food', label: 'مطاعم سريعة' },
  { value: 'bakery_sweets', label: 'حلويات / مخابز' },
  { value: 'beverages', label: 'عصائر / مشروبات' },
  { value: 'services', label: 'منشأة خدمية' },
  { value: 'multi_branch', label: 'منشأة متعددة الفروع' },
  { value: 'integrated', label: 'منشأة متكاملة / ربط خارجي' },
]);

const COUNTRIES = Object.freeze([
  { code: 'YE', name: 'اليمن', timezone: 'Asia/Aden', currency: 'YER' },
  { code: 'SA', name: 'السعودية', timezone: 'Asia/Riyadh', currency: 'SAR' },
  { code: 'AE', name: 'الإمارات', timezone: 'Asia/Dubai', currency: 'AED' },
  { code: 'OM', name: 'عُمان', timezone: 'Asia/Muscat', currency: 'OMR' },
  { code: 'QA', name: 'قطر', timezone: 'Asia/Qatar', currency: 'QAR' },
  { code: 'BH', name: 'البحرين', timezone: 'Asia/Bahrain', currency: 'BHD' },
  { code: 'KW', name: 'الكويت', timezone: 'Asia/Kuwait', currency: 'KWD' },
  { code: 'EG', name: 'مصر', timezone: 'Africa/Cairo', currency: 'EGP' },
  { code: 'JO', name: 'الأردن', timezone: 'Asia/Amman', currency: 'JOD' },
  { code: 'IQ', name: 'العراق', timezone: 'Asia/Baghdad', currency: 'IQD' },
  { code: 'TR', name: 'تركيا', timezone: 'Europe/Istanbul', currency: 'TRY' },
  { code: 'US', name: 'الولايات المتحدة', timezone: 'America/New_York', currency: 'USD' },
  { code: 'GB', name: 'المملكة المتحدة', timezone: 'Europe/London', currency: 'GBP' },
  { code: 'DE', name: 'ألمانيا', timezone: 'Europe/Berlin', currency: 'EUR' },
  { code: 'FR', name: 'فرنسا', timezone: 'Europe/Paris', currency: 'EUR' },
]);

const TYPES = Object.freeze({
  products: {
    label: 'الأصناف',
    columns: ['code','name','name_ar','barcode','unit_price','cost','tax_rate','uom','category','brand'],
    template: 'code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand',
  },
  customers: {
    label: 'العملاء',
    columns: ['id','name','phone','email','tax_number','credit_limit','address'],
    template: 'id,name,phone,email,tax_number,credit_limit,address',
  },
  warehouses: {
    label: 'المخازن',
    columns: ['id','name','address'],
    template: 'id,name,address',
  },
});

function parseCsv(input) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const ch=text[i], next=text[i+1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell.trim()); cell=''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch==='\r' && next==='\n') i++;
      row.push(cell.trim()); cell='';
      if (row.some(v=>v!=='')) rows.push(row);
      row=[];
    } else cell += ch;
  }
  if (quoted) throw Object.assign(new Error('الملف يحتوي اقتباسًا غير مغلق'), {statusCode:400});
  row.push(cell.trim());
  if (row.some(v=>v!=='')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h=>String(h).trim().toLowerCase());
  return rows.map((values, idx) => {
    const out={};
    headers.forEach((h,i)=>{ if(h) out[h]=values[i] ?? ''; });
    out.__row=idx+2;
    return out;
  });
}

function csvEscape(v) {
  const s=String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

function ensureAdmin(req, res) {
  if (!req.user) { res.status(401).json({exc_type:'AuthenticationError',_error_message:'تسجيل الدخول مطلوب',message:'تسجيل الدخول مطلوب'}); return false; }
  if (!['ADMIN','MANAGER'].includes(String(req.user.role||''))) { res.status(403).json({exc_type:'PermissionError',_error_message:'صلاحية غير كافية',message:'صلاحية غير كافية'}); return false; }
  return true;
}

function tenant(req,res) {
  try { return assertTenantScope(req).tenantId ?? ''; }
  catch(e) { res.status(e?.statusCode||403).json({exc_type:'PermissionError',_error_message:e?.message||'نطاق المستأجر غير صالح',message:e?.message||'نطاق المستأجر غير صالح'}); return null; }
}

function validateRows(type, rows, tenantId) {
  const errors=[], valid=[];
  const seen=new Set();
  for (const r of rows) {
    const line=r.__row;
    const key=type==='products' ? String(r.code||'').trim() : String(r.id||r.name||'').trim();
    if (!key) { errors.push({row:line,message:type==='products'?'كود الصنف مطلوب':'المعرّف أو الاسم مطلوب'}); continue; }
    if (seen.has(key)) { errors.push({row:line,message:'تكرار داخل الملف: '+key}); continue; }
    seen.add(key);
    if (type==='products') {
      const price=Number(r.unit_price||0), cost=Number(r.cost||0), tax=Number(r.tax_rate||0);
      if (!Number.isFinite(price)||price<0) { errors.push({row:line,message:'سعر البيع غير صالح'}); continue; }
      if (!Number.isFinite(cost)||cost<0) { errors.push({row:line,message:'التكلفة غير صالحة'}); continue; }
      if (!Number.isFinite(tax)||tax<0||tax>100) { errors.push({row:line,message:'الضريبة يجب أن تكون بين 0 و100'}); continue; }
      const exists=db.prepare('SELECT id FROM products WHERE code=? AND tenant_id=?').get(key,tenantId);
      if (exists) { errors.push({row:line,message:'كود الصنف موجود مسبقًا: '+key}); continue; }
    } else if (type==='customers') {
      if (String(r.name||'').trim().length<2) { errors.push({row:line,message:'اسم العميل مطلوب'}); continue; }
      if (r.credit_limit!=='' && (!Number.isFinite(Number(r.credit_limit)) || Number(r.credit_limit)<0)) { errors.push({row:line,message:'حد الائتمان غير صالح'}); continue; }
      if (r.id) {
        const exists=db.prepare('SELECT id FROM customers WHERE id=? AND tenant_id=?').get(String(r.id).trim(),tenantId);
        if (exists) { errors.push({row:line,message:'معرّف العميل موجود مسبقًا: '+r.id}); continue; }
      }
    } else {
      if (String(r.name||'').trim().length<2) { errors.push({row:line,message:'اسم المخزن مطلوب'}); continue; }
      if (r.id && db.prepare('SELECT id FROM warehouses WHERE id=? AND tenant_id=?').get(String(r.id).trim(),tenantId)) { errors.push({row:line,message:'معرّف المخزن موجود مسبقًا: '+r.id}); continue; }
    }
    valid.push(r);
  }
  return {valid,errors};
}

function applyRows(type, rows, tenantId, userId) {
  db.transaction(() => {
    for (const r of rows) {
      if(type==='products') db.prepare('INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active,tenant_id,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(crypto.randomUUID(),String(r.code).trim(),String(r.name||r.name_ar).trim(),String(r.name_ar||r.name||'').trim(),String(r.barcode||'').trim(),Number(r.unit_price||0),Number(r.cost||0),Number(r.tax_rate||0),String(r.uom||'Unit').trim(),String(r.category||'').trim(),String(r.brand||'').trim(),1,tenantId,userId,userId);
      else if(type==='customers') db.prepare('INSERT INTO customers (id,name,phone,email,tax_number,credit_limit,address,is_active,tenant_id,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(String(r.id||crypto.randomUUID()).trim(),String(r.name).trim(),String(r.phone||'').trim(),String(r.email||'').trim(),String(r.tax_number||'').trim(),Number(r.credit_limit||0),String(r.address||'').trim(),1,tenantId,userId,userId);
      else db.prepare('INSERT INTO warehouses (id,name,address,is_active,tenant_id) VALUES (?,?,?,?,?)')
        .run(String(r.id||crypto.randomUUID()).trim(),String(r.name).trim(),String(r.address||'').trim(),1,tenantId);
    }
  })();
  return rows.length;
}

  def('DyPOS.api.onboarding.profile', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!ensureAdmin(req,res)) return;
    const tenantId=tenant(req,res); if(tenantId===null) return;
    const org=db.prepare('SELECT id,name,country_code,timezone,establishment_type FROM organizations WHERE tenant_id=? AND is_active=1 ORDER BY created_at LIMIT 1').get(tenantId);
    if(!org) return res.status(404).json({message:'المؤسسة غير موجودة'});
    const readiness = {
      products: Number(db.prepare('SELECT COUNT(*) AS n FROM products WHERE tenant_id=?').get(tenantId)?.n || 0),
      customers: Number(db.prepare('SELECT COUNT(*) AS n FROM customers WHERE tenant_id=?').get(tenantId)?.n || 0),
      warehouses: Number(db.prepare('SELECT COUNT(*) AS n FROM warehouses WHERE tenant_id=?').get(tenantId)?.n || 0),
      defaultWarehouse: getSetting('default_warehouse',''),
      currency: getSetting('currency',''),
    };
    return res.json({message:{organization:org,countries:COUNTRIES,establishmentTypes:ESTABLISHMENT_TYPES,readiness}});
  });

  def('DyPOS.api.onboarding.save_profile', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!ensureAdmin(req,res)) return;
    const tenantId=tenant(req,res); if(tenantId===null) return;
    const country=COUNTRIES.find(c=>c.code===String(params.countryCode||'').toUpperCase());
    const type=ESTABLISHMENT_TYPES.find(t=>t.value===String(params.establishmentType||''));
    if(!country || !type) return res.status(422).json({message:'الدولة أو نوع المنشأة غير صالح'});
    const timezone=String(params.timezone||country.timezone).trim().slice(0,64);
    const currency=String(params.currency||country.currency).trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(currency)) return res.status(422).json({message:'رمز العملة غير صالح'});
    const org=db.prepare('SELECT id,name FROM organizations WHERE tenant_id=? AND is_active=1 ORDER BY created_at LIMIT 1').get(tenantId);
    if(!org) return res.status(404).json({message:'المؤسسة غير موجودة'});
    db.transaction(()=>{
      db.prepare('UPDATE organizations SET country_code=?, timezone=?, establishment_type=?, updated_at=datetime("now") WHERE id=? AND tenant_id=?')
        .run(country.code,timezone,type.value,org.id,tenantId);
      setSetting('currency',currency);
      setSetting('country_code',country.code);
      setSetting('business_name',String(org.name || '').slice(0,200));
      setSetting('tax_rate_default','0');
    })();
    req.audit?.('onboarding.profile.update',{tenantId,organizationId:org.id,country:country.code,establishmentType:type.value});
    return res.json({message:{saved:true,country,establishmentType:type}});
  });

  def('DyPOS.api.onboarding.templates', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!ensureAdmin(req,res)) return;
    const tenantId=tenant(req,res); if(tenantId===null) return;
    const rows=db.prepare('SELECT id,name,data_type,content,version,updated_at FROM onboarding_templates WHERE tenant_id=? AND is_active=1 ORDER BY updated_at DESC').all(tenantId);
    return res.json({message:{templates:rows}});
  });

  def('DyPOS.api.onboarding.save_template', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!ensureAdmin(req,res)) return;
    const tenantId=tenant(req,res); if(tenantId===null) return;
    const name=String(params.name||'').trim().slice(0,100);
    const dataType=String(params.dataType||'').trim();
    const content=String(params.content||'');
    if(name.length<2 || !TYPES[dataType] || !content.trim()) return res.status(422).json({message:'اسم القالب ونوع البيانات والمحتوى مطلوبة'});
    const id=crypto.randomUUID();
    db.prepare(`INSERT INTO onboarding_templates (id,tenant_id,name,data_type,content,version,created_by) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id,name,data_type) DO UPDATE SET content=excluded.content,version=onboarding_templates.version+1,updated_at=datetime('now')`).run(id,tenantId,name,dataType,content,1,String(req.user.id||''));
    req.audit?.('onboarding.template.save',{tenantId,name,dataType});
    return res.json({message:{saved:true,name,dataType}});
  });

  def('DyPOS.api.onboarding.delete_template', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!ensureAdmin(req,res)) return;
    const tenantId=tenant(req,res); if(tenantId===null) return;
    const id=String(params.id||'').trim();
    if(!id) return res.status(422).json({message:'معرّف القالب مطلوب'});
    db.prepare('UPDATE onboarding_templates SET is_active=0,updated_at=datetime("now") WHERE id=? AND tenant_id=?').run(id,tenantId);
    return res.json({message:{deleted:true}});
  });

export function registerMasterDataImportVerbs(def, requireUser) {
  def('DyPOS.api.onboarding.master_data_template', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!['ADMIN','MANAGER'].includes(String(req.user.role||''))) return res.status(403).json({message:'صلاحية غير كافية'});
    const type=String(params.type||'products');
    const spec=TYPES[type];
    if(!spec) return res.status(400).json({message:'نوع البيانات غير مدعوم'});
    const csv='\uFEFF'+spec.template+'\n';
    return res.json({message:{type,filename:'dypos-'+type+'-template.csv',csv,columns:spec.columns}});
  });

  def('DyPOS.api.onboarding.import_master_data', (params, req, res) => {
    if (!requireUser(req,res)) return;
    if (!ensureAdmin(req,res)) return;
    const tenantId=tenant(req,res); if(tenantId===null) return;
    const type=String(params.type||'products');
    if(!TYPES[type]) return res.status(400).json({message:'نوع البيانات غير مدعوم'});
    let rows;
    try { rows=Array.isArray(params.rows) ? params.rows.map((r,i)=>({...r,__row:i+1})) : parseCsv(params.csv); }
    catch(e) { return res.status(400).json({message:e.message}); }
    const checked=validateRows(type,rows,tenantId);
    if(params.dryRun===1||params.dryRun==='1'||params.dryRun===true)
      return res.json({message:{dryRun:true,type,valid:checked.valid.length,invalid:checked.errors.length,errors:checked.errors,preview:checked.valid.slice(0,25)}});
    if(checked.errors.length) return res.status(422).json({message:{type,valid:checked.valid.length,invalid:checked.errors.length,errors:checked.errors,applied:0},exc_type:'ValidationError',_error_message:'تم رفض الملف: أصلح الأخطاء ثم أعد المحاولة'});
    try {
      const applied=applyRows(type,checked.valid,tenantId,String(req.user.id||''));
      req.audit?.('master_data.import',{type,applied,tenantId});
      return res.status(201).json({message:{type,applied,invalid:0,errors:[],atomic:true}});
    } catch(e) {
      return res.status(422).json({message:{type,applied:0,invalid:checked.valid.length,errors:[{row:null,message:String(e.message||'فشل الاستيراد').slice(0,200)}],atomic:true},exc_type:'ValidationError',_error_message:'فشل الاستيراد؛ لم تُحفظ بيانات جزئية'});
    }
  });
}
