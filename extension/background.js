'use strict';
// Serialize all writes: one run and one owner tab for the whole extension.
let chain = Promise.resolve();
const successLock='Bu ilan daha önce başarıyla yenilendi; tekrar işleme kapalı.';
const fresh = () => ({rev:0, active:false, mode:'idle', items:[], results:[], blocked:{}, message:'Önce Süresi Dolmuş listesini açıp ilanları tara.'});
async function read() {
  const raw=(await chrome.storage.local.get('state')).state;
  if(!raw||typeof raw!=='object')return fresh();
  return {...fresh(),...raw,items:Array.isArray(raw.items)?raw.items:[],results:Array.isArray(raw.results)?raw.results:[],blocked:raw.blocked&&typeof raw.blocked==='object'?raw.blocked:{}};
}
async function save(s) { s.rev++; await chrome.storage.local.set({state:s}); return s; }
function safeListURL(value){try{const u=new URL(value);return u.origin==='https://www.letgo.com'&&u.pathname==='/ilanlarim'&&u.searchParams.get('status')==='outdated';}catch{return false;}}
function finish(s, message) { s.active=false; s.message=message; s.stop=false; }
function result(s, status, reason) {
  if (s.current && !s.results.some(r=>r.id===s.current.id)) s.results.push({...s.current,status,reason,time:new Date().toISOString()});
  if (status==='sonucu belirsiz' && s.current) s.blocked[s.current.id]=reason;
}
async function handle(m, sender) {
  const s = await read();
  if (m.type==='GET') {
    if(s.active && Date.now()-s.beat>60000) {
      result(s,s.pending?.final?'sonucu belirsiz':'başarısız','İşlem sekmesinden 60 saniyedir yanıt alınamıyor.');
      finish(s,'Sekme yanıt vermiyor; güvenli biçimde durduruldu.');await save(s);
    }
    return s;
  }
  if (m.type==='STOP') {
    s.stop=true;
    s.message=s.pending?.final ? 'Durdur istendi; son yayınlama sonucu kontrol ediliyor.' : 'Durdur istendi; yeni eylem yapılmayacak.';
    if(s.active&&!s.pending?.final){result(s,'atlanan','Kullanıcı durdurdu; yeni eylem yapılmadı.');finish(s,'Kullanıcı durdurdu.');}
    if (!s.active) s.stop=false;
    return save(s);
  }
  const tabId=sender.tab?.id;
  if (tabId==null || !sender.url?.startsWith('https://www.letgo.com/')) throw Error('Yalnızca Letgo sekmesi işlem başlatabilir.');
  if (m.type==='START') {
    if (s.active) throw Error('Başka bir çalışma sürüyor. Önce Durdur kullanın.');
    const u=new URL(sender.url);
    if (u.pathname!=='/ilanlarim' || u.searchParams.get('status')!=='outdated') throw Error('Süresi Dolmuş listesini açın.');
    if (m.mode!=='scan' && m.mode!=='renew') throw Error('Geçersiz çalışma.');
    if(!safeListURL(m.listStart))throw Error('Güvenli başlangıç sayfası doğrulanamadı.');
    let queue=[];
    if (m.mode==='renew') {
      if (!s.scanComplete) throw Error('Önce tüm ilanları tarayın.');
      const ids=new Set(m.ids);
      queue=s.items.filter(i=>ids.has(i.id) && !s.blocked[i.id]);
      if (!queue.length) throw Error('Yenilenebilir bir ilan seçilmedi.');
    }
    Object.assign(s,{active:true,run:crypto.randomUUID(),owner:tabId,mode:m.mode,stop:false,pending:null,current:null,queue,results:[],visited:[],fingerprints:{},step:'list',message:m.mode==='scan'?'İlanlar taranıyor…':'Yenileme başladı.',listStart:m.listStart,beat:Date.now()});
    if (m.mode==='scan') {s.items=[];s.scanComplete=false;for(const [id,reason] of Object.entries(s.blocked))if(reason===successLock)delete s.blocked[id];}
    return save(s);
  }
  if (!s.active || s.owner!==tabId || s.run!==m.run) return {denied:true};
  if (m.type==='HEARTBEAT') {s.beat=Date.now(); await chrome.storage.local.set({state:s});return s;}
  if (m.rev!==s.rev) return {denied:true};
  if (m.type==='PATCH') {
    if (s.stop && m.action) return {denied:true};
    // Only content-script-owned progression fields are accepted.
    for (const k of ['pending','current','queue','items','visited','fingerprints','step','message','scanComplete']) if (k in m.patch) s[k]=m.patch[k];
    return save(s);
  }
  if (m.type==='RESULT') {
    result(s,m.status,m.reason); s.pending=null; s.current=null; s.fingerprints={}; s.step='list'; s.visited=[];
    if (m.status==='başarılı' && s.results.length) s.blocked[s.results.at(-1).id]=successLock;
    if (m.halt || s.stop) finish(s,m.reason); else s.message=m.reason;
    return save(s);
  }
  if (m.type==='FINISH') {finish(s,m.message);s.pending=null;return save(s);}
  throw Error('Bilinmeyen işlem.');
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  chain=chain.then(()=>handle(m,sender)).then(reply,e=>reply({error:e.message})); return true;
});
chrome.tabs.onRemoved.addListener(id=>{
  chain=chain.then(async()=>{const s=await read();if(s.active&&s.owner===id){result(s,s.pending?.final?'sonucu belirsiz':'başarısız','İşlem sekmesi kapandı.');finish(s,'Sekme kapandı; otomatik devam edilmez.');await save(s);}});
});
chrome.runtime.onStartup.addListener(()=>{
  chain=chain.then(async()=>{const s=await read();if(s.active){result(s,s.pending?.final?'sonucu belirsiz':'başarısız','Tarayıcı yeniden başladı.');finish(s,'Tarayıcı yeniden başladı; işlem durduruldu.');await save(s);}});
});
