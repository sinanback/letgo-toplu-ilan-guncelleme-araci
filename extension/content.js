(() => {
  'use strict';
  const C=LetgoCore, timeout=25000;
  const all=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const visible=e=>!!e && !!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
  const text=e=>C.norm(e?.textContent);
  const buttons=(name,root=document)=>all('button',root).filter(e=>visible(e)&&text(e)===name);
  const dialogs=()=>{const semantic=all('[role="dialog"],[role="alertdialog"]').filter(visible);return semantic.length?semantic:all('[data-slot="dialog-content"]').filter(visible);};
  const one=(arr,why)=>{if(arr.length!==1) throw Error(why);return arr[0];};
  const letgoPath=(value,path)=>{try{const u=new URL(value);return u.origin==='https://www.letgo.com'&&u.pathname===path;}catch{return false;}};
  const send=async m=>{const r=await chrome.runtime.sendMessage(m);if(r?.error)throw Error(r.error);return r;};
  const patch=(s,p,action=false)=>send({type:'PATCH',run:s.run,rev:s.rev,patch:p,action});
  const stop=(s,message)=>send({type:'FINISH',run:s.run,rev:s.rev,message});
  const record=(s,status,reason,halt=false)=>send({type:'RESULT',run:s.run,rev:s.rev,status,reason,halt});
  let busy=false, localStop=false, lastRun='';
  const cards=()=>all('a[href]').map(a=>{try{const u=new URL(a.href);return u.origin==='https://www.letgo.com'&&/^\/ilanlarim\/\d+\/detay$/.test(u.pathname)?{a,u}:null;}catch{return null;}}).filter(Boolean).map(({a,u})=>{
    const spans=all('span',a), price=spans.find(e=>C.money(text(e))!==null), status=spans.find(e=>['Süresi Dolmuş','Etkin'].includes(text(e)));
    const img=a.querySelector('img');
    const imageSource=img?.getAttribute('src')||img?.getAttribute('data-src')||'';
    return {id:u.pathname.split('/')[2],title:img?.alt||'',price:text(price),status:text(status),href:u.href,image:imageSource.split('/image;')[0],element:a};
  });
  const serial=({element,...item})=>item;
  const listLinks=()=>all('a[href]').filter(a=>C.listURL(a.href));
  function listStart() {
    if(C.listURL(location.href))return 'https://www.letgo.com/ilanlarim?status=outdated';
  }
  function nextPage() {
    const a=all('nav[aria-label="pagination"] a').find(a=>a.getAttribute('rel')==='next'||/^(next page|sonraki sayfa)$/i.test(C.norm(a.getAttribute('aria-label'))||text(a)));
    if(!a || a.getAttribute('aria-disabled')==='true')return null;
    return C.listURL(a.href)&&a.href!==location.href?a.href:null;
  }
  function blocker() {
    const body=C.norm(document.body.innerText);
    if (/captcha|robot olmadığ|insan olduğunuzu|çok fazla istek|erişim engellendi/i.test(body))return 'CAPTCHA veya erişim sınırı görüldü.';
    if (/ilan hakkınız (?:kalmadı|doldu)|ilan verme limit|ilan kotanız|oturumunuz.*(?:sona|doldu)/i.test(body))return 'Oturum veya ilan kotası engeli görüldü.';
    const mainText=C.norm(document.querySelector('main')?.innerText);
    if(/kabul ediyor|kabul etmeniz|sözleşme.{0,60}onay|üyelik satın|ilan hakkı satın/i.test(mainText))return 'Yeni sözleşme veya satın alma adımı görüldü; kullanıcı kontrolü gerekiyor.';
    if(dialogs().length)return 'Beklenmeyen pencere açıldı; kullanıcı kontrolü gerekiyor.';
    return null;
  }
  function listingUnavailable() {
    const body=text(document.body).toLocaleLowerCase('tr');
    return /(?:ilan|ürün|sayfa) (?:bulunamadı|mevcut değil|artık mevcut değil|yayından kaldırılmış)|aradığınız ilan (?:bulunamadı|artık mevcut değil)|bu ilan (?:artık yayında değil|yayından kaldırılmış)/i.test(body);
  }
  function emptyExpiredList() {
    if(!C.listURL(location.href))return false;
    const body=text(document.body).toLocaleLowerCase('tr');
    const zeroCount=listLinks().some(a=>/süresi dolmuş\s*\(\s*0\s*\)/i.test(text(a)));
    const emptySearch=text(document.querySelector('h1,h2,h3')).toLocaleLowerCase('tr')==='ilan bulunamadı'&&/arama kriterlerine uygun ilan bulunamadı/i.test(body);
    return zeroCount||emptySearch||/süresi dolmuş ilan(?:ınız|ların(?:ız)?)? (?:bulunmuyor|bulunamadı|yok)|yenilenecek ilan (?:bulunmuyor|bulunamadı|yok)/i.test(body);
  }
  function closeKnownSuccessPromo() {
    const dialog=dialogs().find(d=>text(d.querySelector('h1,h2,[role="heading"]'))==='Harekete geç, daha görünür ol!');
    if(!dialog)return false;
    const close=all('button',dialog).filter(e=>visible(e)&&['Close','Kapat'].includes(text(e)||C.norm(e.getAttribute('aria-label'))||C.norm(e.getAttribute('title'))));
    // The dialog is mounted in stages. Do not halt the completed publication
    // while its close control is still missing or temporarily ambiguous.
    if(close.length===1)close[0].click();
    return true;
  }
  function priceConfirmDialog(s,phase) {
    if(phase!=='info'||s.pending?.key!=='info'||s.pending?.expected!=='features'||s.pending?.final)return null;
    const openDialogs=dialogs();
    if(openDialogs.length!==1)return null;
    const dialog=openDialogs[0],heading=text(dialog.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]'));
    if(!heading.startsWith('Fiyatı güncellemek istediğine emin mi'))return null;
    const expected=C.norm(s.current?.price),body=text(dialog);
    if(!expected||!body.toLocaleLowerCase('tr').includes(`fiyatı ${expected} olarak güncellemek`.toLocaleLowerCase('tr')))throw Error('Fiyat onayındaki tutar taranan ilan fiyatıyla eşleşmiyor.');
    const update=buttons('Güncelle',dialog),cancel=buttons('Vazgeç',dialog);
    if(update.length>1||cancel.length>1)throw Error('Fiyat onay penceresinde birden fazla işlem düğmesi bulundu.');
    return {update:update.length===1&&cancel.length===1&&!update[0].disabled?update[0]:null};
  }
  function formState() {
    const main=document.querySelector('main');if(!main)throw Error('İlan formu bulunamadı.');
    const fields=all('input,textarea',main).filter(e=>e.type!=='file').map(e=>({label:text(e.closest('label')),type:e.type,value:e.value,checked:e.checked,disabled:e.disabled}));
    const switches=all('[role="switch"]',main).map(e=>e.getAttribute('aria-checked'));
    const images=all('img',main).map(e=>e.getAttribute('src'));
    // Fingerprint only; contact values are not written to storage or logs.
    const contacts=all('button',main).filter(e=>text(e).startsWith('Telefon Numarası')).map(text);
    const category=all('li',main).map(text);
    return {fields,switches,images,contacts,category};
  }
  async function digest(data) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)))),n=>n.toString(16).padStart(2,'0')).join('');}
  function requiredValid() {
    const inputs=all('main input,main textarea').filter(e=>e.type!=='file'&&!e.disabled);
    if(inputs.some(e=>e.required&&!C.norm(e.value)))throw Error('Eksik zorunlu alan var; otomatik doldurulmadı.');
    if(inputs.some(e=>!e.validity.valid))throw Error('Form doğrulaması başarısız; alanlar değiştirilmedi.');
  }
  async function act(s,key,expected,fn,final=false,extra={}) {
    if(localStop)return;
    const grant=await patch(s,{...extra,pending:{key,expected,final,at:Date.now()},message:final?'0 TL doğrulandı; yayınlama sonucu bekleniyor.':`${s.current?.title||'Liste'}: ${key}`},true);
    if(grant.denied||localStop)return;
    // Re-read stop immediately before each DOM action. A submitted final request is never repeated.
    const latest=await send({type:'GET'});
    if(!latest.active||latest.run!==s.run||latest.stop||localStop)return;
    fn();
  }
  async function navigate(s,url,key) {
    if(!C.listURL(url))throw Error('Güvenli liste bağlantısı bulunamadı.');
    await act(s,key,'list',()=>location.assign(url),false);
  }
  async function tick() {
    if(busy)return;busy=true;
    let s;
    try {
      s=await send({type:'GET'});
      if(!s.active)return;
      const hello=await send({type:'HEARTBEAT',run:s.run});if(hello.denied)return;s=hello;
      if(lastRun!==s.run){lastRun=s.run;localStop=false;}
      let phase=C.phase(location.pathname,s.current?.id);
      // Success takes precedence over optional marketing dialogs shown after publishing.
      const pendingSuccessPage=s.pending?.final&&phase==='success';
      if(pendingSuccessPage) {
        const success=C.norm(document.body.innerText).includes('Başarılı şekilde ilan verdin');
        const correct=all('a[href]').some(a=>letgoPath(a.href,`/item/${s.current.id}`));
        if(success&&correct){await record(s,'başarılı',`${s.current.title}: ücretsiz yayınlama doğrulandı.`);return;}
      }
      if(s.stop||localStop) {
        if(s.pending?.final && Date.now()-s.pending.at<timeout)return;
        if(s.pending?.final)await record(s,'sonucu belirsiz','Durdur sonrası yayınlama sonucu doğrulanamadı. İlanı etkin listeden kontrol edin.',true);
        else if(s.current)await record(s,'atlanan','Kullanıcı durdurdu; yeni eylem yapılmadı.',true);
        else await stop(s,'Kullanıcı durdurdu.');
        return;
      }
      if(s.current&&!s.pending?.final&&listingUnavailable()) {
        await record(s,'atlanan',`${s.current.title}: ilan artık mevcut değil; sıradaki ilana geçildi.`);return;
      }
      // Letgo mounts the optional post-success Vitamin dialog in stages. Once
      // the matching listing success was already recorded, leave this page
      // without waiting for or interacting with an incomplete promotion.
      const recordedSuccessPage=phase==='success'&&!s.pending?.final&&!s.current;
      // The known Vitamin offer can appear before the success text and item
      // link finish rendering. Keep verifying the already-submitted result
      // instead of treating that load order as an unexpected blocker.
      if(pendingSuccessPage||recordedSuccessPage)closeKnownSuccessPromo();
      else {
        const priceConfirm=priceConfirmDialog(s,phase);
        if(priceConfirm) {
          if(!priceConfirm.update) {
            if(Date.now()-s.pending.at>timeout)throw Error('Fiyat onay penceresi 25 saniyede tamamlanmadı.');
            return;
          }
          const attempts=Number(s.fingerprints.priceConfirmAttempts||0),lastAt=Number(s.fingerprints.priceConfirmLastAt||0);
          if(attempts>=3) {
            if(Date.now()-lastAt>2500)throw Error('Fiyat onay penceresi üç güvenli denemeden sonra kapanmadı.');
            return;
          }
          if(!lastAt||Date.now()-lastAt>=1200) {
            if(await digest(formState())!==s.fingerprints.info)throw Error('İlan bilgileri fiyat onayından önce değişti.');
            const now=Date.now();
            const granted=await patch(s,{pending:{...s.pending,at:attempts?s.pending.at:now},fingerprints:{...s.fingerprints,priceConfirmAttempts:attempts+1,priceConfirmLastAt:now},message:`${s.current.title}: ${s.current.price} fiyat onayı veriliyor${attempts?' (yeniden deneniyor)':''}.`},true);
            if(!granted.denied&&!localStop){const latest=await send({type:'GET'});if(latest.active&&!latest.stop)priceConfirm.update.click();}
          }
          return;
        }
        const problem=blocker();if(problem)throw Error(problem);
      }
      if(s.pending) {
        const p=s.pending;
        const arrived=p.expected==='list'?C.listURL(location.href)&&location.href!==p.key:phase===p.expected;
        // Navigation keys carry the previous URL; ordinary step keys carry phase names.
        if(!p.final && arrived && (p.expected!=='list'||cards().length)) {
          await patch(s,{pending:null,step:phase});return;
        }
        if(s.mode==='renew'&&!p.final&&p.expected!=='list'&&phase==='list'&&C.listURL(location.href)&&Date.now()-p.at>4000) {
          await record(s,'atlanan',`${s.current.title}: işlem sayfası açılmadan ilan listesine dönüldü; sıradaki ilana geçildi.`);return;
        }
        if(Date.now()-p.at>timeout) {
          if(p.final)await record(s,'sonucu belirsiz','Yayınlama sonucu doğrulanamadı. Tekrar denenmedi; etkin ilanları kontrol edin.',true);
          else throw Error('Sayfa geçişi 25 saniyede doğrulanamadı. İşlem tekrarlanmadı.');
        }
        return;
      }
      if(s.mode==='scan') {
        if(!C.listURL(location.href))throw Error('Tarama yalnızca Süresi Dolmuş listesinde yapılır.');
        const pageItems=cards();
        if(!pageItems.length&&emptyExpiredList()){
          s=await patch(s,{items:[],visited:[location.href],scanComplete:true});if(s.denied)return;
          await stop(s,'Tarama tamamlandı: 0 ilan. Süresi dolmuş ilan bulunamadı.');return;
        }
        if(!pageItems.length)throw Error('İlan kartları bulunamadı. Listeyi kontrol edin.');
        if(pageItems.some(item=>!item.title||!item.image||C.money(item.price)===null||!['Süresi Dolmuş','Etkin'].includes(item.status)))throw Error('İlan kartı yapısı değişmiş; eksik veya tanınmayan alan bulundu. Tarama durduruldu.');
        if(s.visited.includes(location.href))throw Error('Sayfalama döngüsü algılandı.');
        const merged=new Map(s.items.map(i=>[i.id,i]));
        for(const item of pageItems)if(item.status==='Süresi Dolmuş'&&item.title&&C.money(item.price)!==null)merged.set(item.id,serial(item));
        const next=nextPage();
        s=await patch(s,{items:[...merged.values()],visited:[...s.visited,location.href],message:`${merged.size} süresi dolmuş ilan bulundu.`});if(s.denied)return;
        if(next){await navigate(s,next,location.href);return;}
        s=await patch(s,{scanComplete:true});if(s.denied)return;
        await stop(s,`Tarama tamamlandı: ${merged.size} ilan. Yenilemek istediklerini seç.`);return;
      }
      if(!s.current) {
        if(!s.queue.length){await stop(s,'Çalışma tamamlandı. Sonuçları aşağıda inceleyebilirsin.');return;}
        const [current,...queue]=s.queue;
        s=await patch(s,{current,queue,visited:[],step:'list',fingerprints:{}});if(s.denied)return;
        if(location.href!==s.listStart){await navigate(s,s.listStart,location.href);return;}
        phase='list';
      }
      if(phase==='list') {
        if(!C.listURL(location.href))throw Error('Süresi Dolmuş filtresi etkin değil.');
        const item=cards().find(i=>i.id===s.current.id);
        if(!item) {
          const next=nextPage();
          if(next&&!s.visited.includes(next)) {
            s=await patch(s,{visited:[...s.visited,location.href]});if(!s.denied)await navigate(s,next,location.href);return;
          }
          await record(s,'atlanan',`${s.current.title}: süresi dolmuş listede yok; işlem yapılmadı.`);return;
        }
        if(item.status!=='Süresi Dolmuş') {await record(s,'atlanan','İlanın süresi dolmuş değil.');return;}
        if(item.title!==s.current.title||item.price!==s.current.price||item.image!==s.current.image)throw Error('İlan taramadan sonra değişmiş. Yeniden tarama gerekiyor.');
        const btn=one(buttons('Yeniden Yayınla',item.element.parentElement),'İlana ait tekil Yeniden Yayınla düğmesi bulunamadı.');
        if(btn.disabled)throw Error('Yeniden Yayınla düğmesi etkin değil.');
        await act(s,'list','info',()=>btn.click());return;
      }
      if(phase!==s.step)throw Error('Beklenmeyen adım veya kullanıcı gezinmesi; işlem durdu.');
      const expectedHead={info:'İlan Bilgileri',features:'İlan Özellikleri',delivery:'Teslimat',vitamin:'İlanını Daha Hızlı Sat'}[phase];
      if(!expectedHead||text(document.querySelector('h1'))!==expectedHead)throw Error('Beklenen ilan adımı bulunamadı.');
      const proceed=one(buttons('Devam Et'),'Devam Et düğmesi tekil değil.');
      if(proceed.disabled)throw Error('Devam Et etkin değil. Eksik alan veya kota olabilir.');
      if(phase==='vitamin') {
        const checks=all('main input[type="checkbox"]');
        const knownBundles={
          'vitamin-bundle-bundle-category+massive+highlight':'Öne Çıkar + Büyük İlan Paketi',
          'vitamin-bundle-bundle-category+peak+highlight':'Öne Çıkar + Zirve Paketi'
        };
        const check=checks.length===1&&knownBundles[checks[0].id]?checks[0]:null;
        const bundleLabel=check&&one(all('main label').filter(e=>e.getAttribute('for')===check.id),'Vitamin paketinin seçim düğmesi doğrulanamadı.');
        if(!check||!C.norm(document.querySelector('main').innerText).includes(knownBundles[check.id]))throw Error('Vitamin seçenekleri değişti; ücretsiz yol doğrulanamadı.');
        if(check.checked) {
          if(s.fingerprints.vitaminRemoved)throw Error('Ücretli paket yeniden seçildi; durduruldu.');
          const granted=await patch(s,{fingerprints:{...s.fingerprints,vitaminRemoved:true},message:'Varsayılan ücretli paket kaldırılıyor.'},true);
          if(!granted.denied&&!localStop){const latest=await send({type:'GET'});if(latest.active&&!latest.stop)bundleLabel.click();}return;
        }
        const total=one(all('main h5').filter(e=>text(e.parentElement).startsWith('Tutar')),'Toplam tutar bulunamadı.');
        if(C.money(text(total))!==0) {
          // React may update the displayed total after the checkbox event.
          if(!s.fingerprints.zeroWait){await patch(s,{fingerprints:{...s.fingerprints,zeroWait:Date.now()}});return;}
          if(Date.now()-s.fingerprints.zeroWait<4000)return;
          throw Error('Toplam 0 TL değil; yayınlama yapılmadı.');
        }
        if(all('main input[type="checkbox"]:checked').length)throw Error('Ücretli seçenek seçili.');
        await act(s,'vitamin','success',()=>{if(check.checked||C.money(text(total))!==0)throw Error('Ücret kontrolü değişti.');proceed.click();},true);return;
      }
      requiredValid();
      const snap=formState();
      if(phase!=='delivery'&&all('main input[type="checkbox"]').length)throw Error('Formda tanınmayan onay kutusu var; işlem durduruldu.');
      if(phase==='info') {
        const field=label=>snap.fields.find(f=>C.norm(f.label)===label)?.value;
        const titleValue=field('İlan Başlığı'),priceValue=field('Fiyat (TL)');
        if(typeof titleValue!=='string'||typeof priceValue!=='string'||titleValue!==s.current.title||Number(priceValue.replace(/\./g,'').replace(',','.'))!==C.money(s.current.price))throw Error('Formdaki başlık veya fiyat taranan ilanla eşleşmedi.');
        const cover=document.querySelector('main img[alt="cover"]');
        if(!cover||!cover.getAttribute('src')?.startsWith(s.current.image+'/'))throw Error('Kapak fotoğrafı doğrulanamadı.');
      }
      if(phase==='delivery') {
        const hand=document.getElementById('handDelivery'),secure=document.getElementById('securePayment');
        if(!hand||!secure||all('main input[type="checkbox"]').length!==2||!hand.checked||secure.checked)throw Error('Bu teslimat düzeni henüz doğrulanmadı; ayarlara dokunulmadı.');
      }
      const hash=await digest(snap);
      if(!s.fingerprints[phase]) {await patch(s,{fingerprints:{...s.fingerprints,[phase]:hash},message:`${s.current.title}: ${expectedHead} bilgileri kontrol edildi.`});return;}
      if(s.fingerprints[phase]!==hash)throw Error('İlan bilgileri adım içinde değişti; işlem durduruldu.');
      await act(s,phase,C.next[phase],()=>{if(JSON.stringify(formState())!==JSON.stringify(snap))throw Error('İlan bilgileri eylemden önce değişti.');proceed.click();});
    } catch(e) {
      if(s?.active) {
        try {
          const latest=await send({type:'GET'});
          if(latest.run===s.run&&latest.active) {
            if(latest.current)await record(latest,latest.pending?.final?'sonucu belirsiz':'başarısız',e.message,true);
            else await stop(latest,e.message);
          }
        }catch { /* Extension reloaded: no further actions. */ }
      }
    } finally {busy=false;}
  }
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(m.type==='PAGE_INFO'){reply({expiredList:C.listURL(location.href)});return;}
    if(m.type==='LOCAL_STOP'){localStop=true;reply({ok:true});return;}
    if(m.type!=='BEGIN')return;
    (async()=>{
      if(!C.listURL(location.href))throw Error('Letgo → İlanlarım → Süresi Dolmuş listesini açın.');
      const start=listStart();if(!start)throw Error('İlk sayfa bağlantısı bulunamadı.');
      if(m.mode==='scan'&&location.href!==start)throw Error('Taramayı Süresi Dolmuş listesinin 1. sayfasından başlatın.');
      localStop=false;
      return send({type:'START',mode:m.mode,ids:m.ids||[],listStart:start});
    })().then(reply,e=>reply({error:e.message}));return true;
  });
  setInterval(tick,800);
})();
