import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import db from '../db/schema.js';
import { ah } from '../lib/async.js';
import { resolveTenantFilter } from '../lib/tenant.js';
import { VERSION } from '../lib/version.js';

const router = Router();
const PROVIDERS = [
  { key:'zatca', category:'fiscal', name:'ZATCA / الفوترة الإلكترونية', modes:['einvoice','reporting','clearance'] },
  { key:'shopify', category:'commerce', name:'Shopify', modes:['orders','products','inventory'] },
  { key:'woocommerce', category:'commerce', name:'WooCommerce', modes:['orders','products','inventory'] },
  { key:'salla', category:'commerce', name:'سلة', modes:['orders','products','inventory'] },
  { key:'zid', category:'commerce', name:'زد', modes:['orders','products','inventory'] },
  { key:'whatsapp', category:'messaging', name:'WhatsApp Business / Cloud API', modes:['messages','templates','webhooks'] },
  { key:'sms', category:'messaging', name:'SMS Gateway', modes:['messages','delivery'] },
  { key:'email', category:'messaging', name:'Email Gateway / SMTP-HTTP', modes:['email','templates'] },
  { key:'telegram', category:'messaging', name:'Telegram Bot', modes:['messages','alerts'] },
  { key:'openai', category:'ai', name:'OpenAI-compatible model gateway', modes:['assistant','forecasting','classification'] },
  { key:'azure_ai', category:'ai', name:'Azure AI / Model gateway', modes:['assistant','forecasting','classification'] },
  { key:'generic_webhook', category:'automation', name:'Generic HTTPS Webhook', modes:['events','commands'] },
];

function tenant(req) {
  const requested = resolveTenantFilter(req).tenantId || null;
  const bound = req.user?.tenantId || null;
  if (requested && bound && String(requested) !== String(bound)) throw Object.assign(new Error('غير موجود'), { statusCode:404 });
  return requested || bound || null;
}
function range(req) {
  const today = new Date().toISOString().slice(0,10);
  const to = String(req.query.to || today).slice(0,10);
  const from = String(req.query.from || to).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw Object.assign(new Error('نطاق التاريخ غير صالح'), {statusCode:400});
  return {from,to};
}

router.get('/catalog', authMiddleware, (_req,res) => res.json({success:true,providers:PROVIDERS,version:VERSION}));

router.get('/overview', authMiddleware, ah(async (req,res) => {
  const t=tenant(req), r=range(req), where=t?' AND tenant_id=?':'', params=[r.from,r.to].concat(t?[t]:[]);
  const head=db.prepare('SELECT COUNT(*) orders,COALESCE(SUM(total),0) gross,COALESCE(SUM(paid_amount),0) paid,COALESCE(SUM(discount_amount),0) discounts,COALESCE(SUM(tax_amount),0) tax FROM invoices WHERE substr(created_at,1,10)>=? AND substr(created_at,1,10)<=? AND status<>\'EXPIRED\''+where).get(...params);
  const daily=db.prepare('SELECT substr(created_at,1,10) day,COUNT(*) orders,COALESCE(SUM(total),0) gross FROM invoices WHERE substr(created_at,1,10)>=? AND substr(created_at,1,10)<=? AND status<>\'EXPIRED\''+where+' GROUP BY day ORDER BY day').all(...params);
  const top=db.prepare('SELECT ii.product_id,MAX(ii.product_name) product_name,COALESCE(SUM(ii.qty),0) qty,COALESCE(SUM(ii.total),0) revenue FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE substr(i.created_at,1,10)>=? AND substr(i.created_at,1,10)<=? AND i.status IN (\'PAID\',\'PARTIAL\')'+(t?' AND i.tenant_id=?':'')+' GROUP BY ii.product_id ORDER BY revenue DESC LIMIT 8').all(...params);
  const low=db.prepare('SELECT COUNT(*) low FROM stock_levels WHERE qty<=5').get();
  const queue=db.prepare('SELECT COUNT(*) pending FROM integration_runs WHERE status IN (\'PENDING\',\'RETRY\')'+(t?' AND tenant_id=?':'')).get(...(t?[t]:[]));
  const dead=db.prepare('SELECT COUNT(*) dead FROM integration_runs WHERE status=\'DEAD\''+(t?' AND tenant_id=?':'')).get(...(t?[t]:[]));
  const orders=Number(head?.orders)||0;
  res.json({success:true,version:VERSION,range:r,kpis:{orders,gross:Number(head?.gross)||0,paid:Number(head?.paid)||0,discounts:Number(head?.discounts)||0,tax:Number(head?.tax)||0,avgTicket:orders?Number(head.gross)/orders:0,lowStock:Number(low?.low)||0,integrationQueue:Number(queue?.pending)||0,integrationDead:Number(dead?.dead)||0},series:daily.map(x=>({day:x.day,orders:Number(x.orders)||0,gross:Number(x.gross)||0})),topProducts:top,liveAt:new Date().toISOString()});
}));

router.get('/live', authMiddleware, ah(async (req,res) => {
  const t=tenant(req);
  const rows=db.prepare('SELECT id,invoice_no,total,status,created_at,terminal_id FROM invoices'+(t?' WHERE tenant_id=?':'')+' ORDER BY created_at DESC LIMIT 12').all(...(t?[t]:[]));
  const q=db.prepare('SELECT COUNT(*) pending FROM integration_runs WHERE status IN (\'PENDING\',\'RETRY\')'+(t?' AND tenant_id=?':'')).get(...(t?[t]:[]));
  res.json({success:true,version:VERSION,liveAt:new Date().toISOString(),sales:rows,activity:{recentSales:rows.length,integrationQueue:Number(q?.pending)||0}});
}));

router.get('/zakat/status', authMiddleware, ah(async (req,res) => {
  const t=tenant(req);
  const rows=db.prepare('SELECT id,adapter,name,base_url,is_active,updated_at FROM integration_configs WHERE adapter IN (\'zatca\',\'zakat\') AND (tenant_id=? OR tenant_id=\'STD\') ORDER BY updated_at DESC').all(t||'STD');
  res.json({success:true,configured:rows.length>0,connections:rows.map(x=>({id:x.id,adapter:x.adapter,name:x.name,base_url:x.base_url,active:Boolean(x.is_active),updated_at:x.updated_at})),standard:'ZATCA-compatible integration boundary',note:'تفعيل الموصل لا يثبت الامتثال الضريبي؛ يلزم التحقق والشهادة والتهيئة الفعلية.'});
}));

router.post('/ai/ask', authMiddleware, requireRole('ADMIN','MANAGER','AUDITOR'), ah(async (req,res) => {
  const prompt=String(req.body?.prompt||'').trim().slice(0,4000);
  if(!prompt) return res.status(400).json({error:'السؤال مطلوب'});
  const t=tenant(req);
  const c=db.prepare('SELECT * FROM integration_configs WHERE adapter IN (\'openai\',\'azure_ai\') AND is_active=1 AND (tenant_id=? OR tenant_id=\'STD\') ORDER BY CASE WHEN tenant_id=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 1').get(t||'STD',t||'STD');
  if(!c) return res.json({success:true,mode:'rules',answer:'لا يوجد مزود ذكاء اصطناعي مفعّل. اربطه من مركز التكاملات.'});
  let credentials={},options={}; try{credentials=JSON.parse(c.credentials||'{}')}catch{} try{options=JSON.parse(c.options||'{}')}catch{}
  const endpoint=String(options.chat_endpoint||c.base_url||'').replace(/\/$/,''); const token=credentials.api_key||credentials.token||'';
  if(!endpoint||!token) return res.status(409).json({error:'إعداد مزود الذكاء الاصطناعي غير مكتمل'});
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({model:options.model||'default',messages:[{role:'system',content:'أنت مساعد أعمال داخل DyPOS. لا تخترع أرقامًا.'},{role:'user',content:prompt}]}),signal:AbortSignal.timeout(30000)});
  const raw=await response.text(); if(!response.ok) return res.status(502).json({error:'مزود الذكاء الاصطناعي رفض الطلب',status:response.status});
  let data; try{data=JSON.parse(raw)}catch{data={output:raw}}
  res.json({success:true,mode:'model',answer:data.choices?.[0]?.message?.content||data.output||data.answer||raw});
}));

router.post('/sync/preview', authMiddleware, requireRole('ADMIN','MANAGER'), ah(async (req,res) => {
  const p=PROVIDERS.find(x=>x.key===String(req.body?.adapter||'').toLowerCase());
  if(!p) return res.status(400).json({error:'مزود غير مدعوم'});
  res.json({success:true,adapter:p.key,direction:String(req.body?.direction||'both'),mode:'preview',plan:p.modes,warning:'المعاينة لا تكتب إلى النظام الخارجي.'});
}));
export default router;
