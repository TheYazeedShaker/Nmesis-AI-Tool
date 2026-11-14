// A synthetic stand-in for the admin's credits, for the fast SQLite tests: the
// ledger, packs, allowances and the people of each company in an attached
// `accounts` database, plus the three functions the Studio's statements call
// (credits_total, credits_balance, record_usage). It follows the rules of the
// admin's accounts.credits_balance and of docs/supabase-setup.sql section 6:
// the period runs from the subscription's start (month arithmetic clamps to the
// month's last day), the allowance is spent before packs, packs are spent
// soonest-expiring first and expire on their own date, and a reference is
// recorded once. `clock` is a fake clock (epoch ms). tests/postgres.test.mjs runs
// the real SQL against Postgres.
const DAY=86_400_000;
const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
function addMonths(day,n){
 const [y,m,d]=day.split('-').map(Number);const first=new Date(Date.UTC(y,m-1+n,1));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return isoDay(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last)));
}
function monthsBetween(from,to){
 const [y1,m1,d1]=from.split('-').map(Number),[y2,m2,d2]=to.split('-').map(Number);
 return (y2-y1)*12+(m2-m1)-(d2<d1?1:0);
}
export function installLedger(db,{clock={now:()=>Date.now()}}={}){
 db.exec("ATTACH ':memory:' AS accounts");
 db.exec(`create table accounts.allowances(org_id text primary key, monthly real not null, starts_on text not null, cycle text not null default 'monthly');
  create table accounts.usage_ledger(id integer primary key autoincrement, at text not null, org_id text, product_key text, feature_key text, actor text, quantity real, unit text, credits real, pack_id integer, provider text, provider_cost_usd real, ref text, details text);
  create table accounts.credit_packs(id integer primary key autoincrement, org_id text not null, credits real not null, bought_on text not null, expires_on text not null);
  create table accounts.studio_people(org_id text, user_id text, role text, status text, email text);
  create table accounts.studio_price_book(key text primary key, value text);
  create view accounts.studio_usage as select id, at, org_id, feature_key, actor, credits, pack_id, ref, coalesce(json_extract(details,'$.action'),'') as action, (provider='own key') as own_key from usage_ledger where product_key='studio';
  create view accounts.studio_credit_packs as select p.id, p.org_id, p.credits, max(p.credits + coalesce((select sum(l.credits) from usage_ledger l where l.pack_id=p.id),0),0) as left_credits, p.bought_on, p.expires_on from credit_packs p;`);
 const today=()=>isoDay(clock.now());
 const packLeft=org=>db.prepare('SELECT p.id, p.credits + coalesce((SELECT sum(l.credits) FROM accounts.usage_ledger l WHERE l.pack_id=p.id),0) AS left FROM accounts.credit_packs p WHERE p.org_id=? AND p.expires_on>=? ORDER BY p.expires_on, p.id').all(org,today());
 function balance(org){
  const a=db.prepare('SELECT * FROM accounts.allowances WHERE org_id=?').get(org);
  let from=null,to=null,monthly=0,used=0;
  if(a){
   const step=a.cycle==='yearly'?12:1,elapsed=Math.max(0,monthsBetween(a.starts_on,today())),n=Math.floor(elapsed/step)*step;
   from=addMonths(a.starts_on,n);to=isoDay(Date.parse(addMonths(a.starts_on,n+step)+'T00:00:00Z')-DAY);monthly=a.monthly;
   const spent=db.prepare("SELECT coalesce(-sum(credits),0) AS s FROM accounts.usage_ledger WHERE org_id=? AND pack_id IS NULL AND credits IS NOT NULL AND at>=? AND at<?").get(org,from+'T00:00:00.000Z',isoDay(Date.parse(to+'T00:00:00Z')+DAY)+'T00:00:00.000Z').s;
   used=Math.max(spent,0);
  }
  const packs=Math.max(packLeft(org).reduce((s,p)=>s+p.left,0),0),left=Math.max(monthly-used,0);
  return {period_from:from,period_to:to,monthly,used,monthly_left:left,packs,total:left+packs};
 }
 function record(org,actor,feature,credits,provider,cost,ref,details){
  if(!/^[0-9a-f-]{36}$/.test(String(actor)))throw new Error('record_usage: the actor must be a user id');
  if(!/^studio\.[a-z_]{2,40}$/.test(String(feature)))throw new Error('record_usage: the feature must be a studio.* key');
  if(!(credits>=0&&credits<=100000&&Number.isInteger(credits)))throw new Error('record_usage: credits must be a whole number');
  if(!['openai','google','higgsfield','topaz','own key'].includes(provider))throw new Error('record_usage: unknown provider');
  if(provider==='own key'&&credits!==0)throw new Error('record_usage: own key costs 0 credits');
  const seen=db.prepare('SELECT coalesce(-sum(credits),0) AS c, count(*) AS n FROM accounts.usage_ledger WHERE org_id=? AND ref=?').get(org,ref);
  if(seen.n)return seen.c;
  const at=new Date(clock.now()).toISOString(),insert=(part,pack,extra)=>db.prepare("INSERT INTO accounts.usage_ledger(at,org_id,product_key,feature_key,actor,quantity,unit,credits,pack_id,provider,provider_cost_usd,ref,details) VALUES(?,?,'studio',?,?,1,'action',?,?,?,?,?,?)").run(at,org,feature,actor,-part,pack,provider,cost===null?null:credits?Math.round(cost*part/credits*1e6)/1e6:cost,ref,extra?JSON.stringify({...JSON.parse(details||'{}'),...extra}):details);
  if(credits===0){insert(0,null);return 0}
  let rest=credits;const first=Math.min(rest,balance(org).monthly_left);
  if(first>0){insert(first,null);rest-=first}
  for(const p of packLeft(org)){if(rest<=0)break;if(p.left>0){const part=Math.min(rest,p.left);insert(part,p.id);rest-=part}}
  if(rest>0)insert(rest,null,{over:true});
  return credits;
 }
 db.function('credits_total',org=>balance(String(org)).total);
 db.function('credits_balance',org=>JSON.stringify(balance(String(org))));
 db.function('record_usage',{varargs:true},(org,actor,feature,credits,provider,cost,ref,details)=>record(String(org),actor,feature,Number(credits),provider,cost===null?null:Number(cost),ref,details));
 return {
  clock,balance,
  allowance:(org,monthly,startsOn,cycle='monthly')=>db.prepare('INSERT INTO accounts.allowances(org_id,monthly,starts_on,cycle) VALUES(?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET monthly=excluded.monthly,starts_on=excluded.starts_on,cycle=excluded.cycle').run(org,monthly,startsOn,cycle),
  pack:(org,credits,expiresOn,boughtOn=today())=>Number(db.prepare('INSERT INTO accounts.credit_packs(org_id,credits,bought_on,expires_on) VALUES(?,?,?,?)').run(org,credits,boughtOn,expiresOn).lastInsertRowid),
  person:(org,userId,role,email)=>db.prepare("INSERT INTO accounts.studio_people(org_id,user_id,role,status,email) VALUES(?,?,?,'active',?)").run(org,userId,role,email),
  price:(key,value)=>db.prepare('INSERT INTO accounts.studio_price_book(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)),
  rows:org=>db.prepare('SELECT * FROM accounts.usage_ledger WHERE org_id=? ORDER BY id').all(org).map(r=>({...r})),
 };
}
