'use strict';
const $=id=>document.getElementById(id);
const selected=new Set();
let state=null,signature='',uiError='',errorAt=0;
const send=m=>chrome.runtime.sendMessage(m);
const scanURL='https://www.letgo.com/ilanlarim?status=outdated';

async function begin(mode,ids=[]){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab)throw Error('Letgo sekmesini açın.');
  const r=await chrome.tabs.sendMessage(tab.id,{type:'BEGIN',mode,ids});
  if(r?.error)throw Error(r.error);
  await refresh();
}
function wrap(fn){return async()=>{try{uiError='';await fn();}catch(e){const message=String(e?.message||e);uiError=message.includes('Receiving end')?'Letgo sekmesini yenileyin ve Süresi Dolmuş listesini açın.':message;errorAt=Date.now();$('status').textContent=uiError;}};}

const show=id=>{$(id).hidden=false;};
const hide=id=>{$(id).hidden=true;};
async function activeTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('Açık sekme bulunamadı.');return tab;}
async function onExpiredList(tab){try{return !!(await chrome.tabs.sendMessage(tab.id,{type:'PAGE_INFO'}))?.expiredList;}catch{return false;}}
async function openScanPage(){const tab=await activeTab();await chrome.tabs.update(tab.id,{url:scanURL,active:true});window.close();}
$('scan').onclick=wrap(async()=>{
  const tab=await activeTab();
  if(!await onExpiredList(tab)){show('scanConfirm');return;}
  const r=await chrome.tabs.sendMessage(tab.id,{type:'BEGIN',mode:'scan',ids:[]});
  if(r?.error)throw Error(r.error);
  await refresh();
});
$('openScanPage').onclick=wrap(openScanPage);
$('scanCancel').onclick=()=>hide('scanConfirm');
$('scanOpen').onclick=wrap(async()=>{
  await openScanPage();
});
$('infoBtn').onclick=()=>show('infoPanel');
$('infoClose').onclick=()=>hide('infoPanel');
for(const id of ['scanConfirm','infoPanel'])$(id).onclick=e=>{if(e.target===$(id))hide(id);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hide('scanConfirm');hide('infoPanel');}});
$('selected').onclick=wrap(()=>begin('renew',[...selected]));
$('all').onclick=wrap(async()=>{
  const ids=state.items.filter(i=>!state.blocked[i.id]).map(i=>i.id);
  selected.clear();
  ids.forEach(id=>selected.add(id));
  for(const box of document.querySelectorAll('.item-check'))box.checked=selected.has(box.value);
  updateSelection();
  await begin('renew',ids);
});
$('stop').onclick=wrap(async()=>{
  await send({type:'STOP'});
  if(state?.owner)try{await chrome.tabs.sendMessage(state.owner,{type:'LOCAL_STOP'});}catch{}
  await refresh();
});
$('search').oninput=applyFilter;
$('selectAll').onchange=()=>{
  const select=$('selectAll').checked;
  for(const row of document.querySelectorAll('.item:not([hidden])')){
    const box=row.querySelector('.item-check');
    if(box.disabled)continue;
    box.checked=select;
    select?selected.add(box.value):selected.delete(box.value);
  }
  updateSelection();
};

function itemResult(id){return state.results.find(r=>r.id===id);}
function statusFor(item){
  if(state.current?.id===item.id)return {text:'İşleniyor',kind:'working'};
  const result=itemResult(item.id);
  if(result?.status==='başarılı')return {text:'Yenilendi',kind:'done'};
  if(result?.status==='atlanan')return {text:'Atlandı',kind:'working'};
  if(result)return {text:result.status,kind:result.status==='başarısız'?'failed':'working'};
  if(state.blocked[item.id])return {text:'İşlem kilitli',kind:'failed'};
  return {text:'Yenilenecek',kind:''};
}
function makeItem(item,index){
  const row=document.createElement('label');row.className='item';row.dataset.search=`${item.title} ${item.id}`.toLocaleLowerCase('tr');
  const visual=document.createElement('span');visual.className='item-visual';visual.textContent=String(index+1).padStart(2,'0');
  const copy=document.createElement('span');copy.className='item-copy';
  const title=document.createElement('span');title.className='item-title';title.textContent=item.title;
  const meta=document.createElement('span');meta.className='item-meta';
  const id=document.createElement('span');id.textContent=`İlan No: ${item.id}`;
  meta.append(id);copy.append(title,meta);
  const itemStatus=statusFor(item);const pill=document.createElement('span');pill.className=`item-state ${itemStatus.kind}`;pill.textContent=`↻ ${itemStatus.text}`;
  const check=document.createElement('input');check.type='checkbox';check.className='item-check';check.value=item.id;check.checked=selected.has(item.id);check.disabled=state.active||!!state.blocked[item.id];check.setAttribute('aria-label',`${item.title} seç`);
  check.onchange=()=>{check.checked?selected.add(item.id):selected.delete(item.id);updateSelection();};
  if(state.blocked[item.id])row.title=state.blocked[item.id];
  row.append(visual,copy,pill,check);return row;
}
function applyFilter(){
  const q=$('search').value.trim().toLocaleLowerCase('tr');
  for(const row of document.querySelectorAll('.item'))row.hidden=!!q&&!row.dataset.search.includes(q);
  syncSelectAll();
}
function syncSelectAll(){
  const boxes=[...document.querySelectorAll('.item:not([hidden]) .item-check:not(:disabled)')];
  $('selectAll').disabled=state?.active||!boxes.length;
  $('selectAll').checked=boxes.length>0&&boxes.every(b=>b.checked);
  $('selectAll').indeterminate=boxes.some(b=>b.checked)&&!boxes.every(b=>b.checked);
}
function updateSelection(){
  $('selectionCount').textContent=`${selected.size} ilan seçildi`;
  $('selectedLabel').textContent=selected.size?`${selected.size} İlanı Yenile`:'Seçilenleri Yenile';
  $('selected').disabled=state.active||!state.scanComplete||!selected.size;
  syncSelectAll();
}
function renderResults(){
  const panel=$('resultPanel');panel.hidden=!state.results.length;
  const counts={};for(const r of state.results)counts[r.status]=(counts[r.status]||0)+1;
  $('resultSummary').textContent=Object.entries(counts).map(([k,v])=>`${v} ${k}`).join(' • ');
  $('results').replaceChildren();
  for(const r of state.results){
    const el=document.createElement('div');el.className='result';el.dataset.status=r.status;
    const title=document.createElement('strong');title.textContent=`${r.title} — ${r.status}`;
    const reason=document.createElement('span');reason.textContent=r.reason;
    el.append(title,reason);$('results').append(el);
  }
}
async function refresh(){
  state=await send({type:'GET'});if(state.error)throw Error(state.error);
  const processed=state.results.length,total=Math.max(state.items.length,processed);
  const progress=total?Math.min(100,Math.round(processed/total*100)):0;
  $('progressRing').style.setProperty('--progress',progress);
  $('progressValue').textContent=`${processed} / ${total}`;
  $('itemCount').textContent=`${state.items.length} ilan`;
  $('status').textContent=uiError&&Date.now()-errorAt<12000?uiError:state.message;
  $('scan').disabled=$('openScanPage').disabled=state.active;
  $('all').disabled=state.active||!state.scanComplete||!state.items.some(i=>!state.blocked[i.id]);
  $('stop').disabled=!state.active;
  const sig=JSON.stringify([state.items,state.blocked,state.active,state.current,state.results]);
  if(signature!==sig){
    signature=sig;$('items').replaceChildren();
    state.items.forEach((item,index)=>$('items').append(makeItem(item,index)));
    $('empty').hidden=!!state.items.length;
    applyFilter();renderResults();
  }
  updateSelection();
}
refresh().catch(e=>{$('status').textContent=e.message;});
setInterval(()=>refresh().catch(()=>{}),1000);
