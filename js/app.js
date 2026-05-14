/* app.js v3 — Boot, Navigation, Helpers */
document.addEventListener('DOMContentLoaded', async () => {
  const boot = document.getElementById('bootScreen');
  const app  = document.getElementById('app');
  const step = (n,s) => { const e=document.getElementById('bs'+n); if(e) e.className='boot-step '+s; };
  const prog = p => { const b=document.getElementById('bootProgress'); if(b) b.style.width=p+'%'; };
  try {
    step(1,'loading'); prog(10);
    await DB.open();
    step(1,'done'); prog(30);
    document.getElementById('dotDB').className='dot green';
    document.getElementById('lblDB').textContent='DB ok';
    step(2,'loading');
    await FaceEngine.loadModels(p => prog(30 + p * 0.55));
    step(2,'done'); prog(85);
    document.getElementById('dotAI').className='dot green';
    document.getElementById('lblAI').textContent='AI ok';
    step(3,'loading');
    await FaceEngine.buildMatcher();
    step(3,'done'); prog(100);
    loadSavedSettings();
    await sleep(350);
    boot.style.opacity='0'; boot.style.transition='opacity 0.4s';
    setTimeout(() => { boot.style.display='none'; app.style.display='flex'; }, 400);
    await Dashboard.load();
    startClock();
  } catch(err) {
    step(1,''); step(2,''); step(3,'');
    const e=document.getElementById('bootError');
    if(e){ e.style.display='block'; e.textContent='Boot failed: '+err.message+'. Refresh to retry.'; }
    console.error('[Boot]',err);
  }
});

function goPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  document.querySelectorAll('[data-page="'+name+'"]').forEach(b => b.classList.add('active'));
  const loads = {
    dashboard: () => Dashboard.load(),
    attend:    () => AttendPage.init(),
    register:  () => {},
    portal:    () => {},
    students:  () => StudentsPage.load(),
    settings:  () => Settings.load()
  };
  loads[name]?.();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(btn =>
    btn.addEventListener('click', () => goPage(btn.dataset.page))
  );
  const modal = document.getElementById('authModal');
  if (modal) modal.addEventListener('click', e => { if(e.target===modal) modal.style.display='none'; });
});

let _tt = null;
function toast(msg, type='info') {
  const el = document.getElementById('toast'); if(!el) return;
  el.textContent = msg; el.className = 'toast show';
  const colors = {success:'var(--green)',error:'var(--red)',warn:'var(--orange)',info:'var(--accent)'};
  el.style.borderLeft = '3px solid '+(colors[type]||'var(--border2)');
  clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 3500);
}

function showBanner(id, type, html) {
  const el = document.getElementById(id); if(!el) return;
  el.className='banner '+type; el.innerHTML=html; el.style.display='block';
}
function hideBanner(id) { const el=document.getElementById(id); if(el) el.style.display='none'; }
function setBtnLoading(id, label) {
  const btn=document.getElementById(id); if(!btn) return;
  btn.disabled=true; btn._orig=btn.innerHTML; btn.innerHTML='<div class="spin"></div> '+label;
}
function setBtnDone(id) {
  const btn=document.getElementById(id); if(!btn) return;
  btn.disabled=false; if(btn._orig) btn.innerHTML=btn._orig;
}
function setText(id, v) { const e=document.getElementById(id); if(e) e.textContent=v; }
function setTag(id, text, live) {
  const el=document.getElementById(id); if(!el) return;
  el.textContent=text; el.className=live?'cam-tag live':'cam-tag';
}
function setScan(id, on) {
  const el=document.getElementById(id); if(!el) return;
  on ? el.classList.add('active') : el.classList.remove('active');
}
function clearCanvas(id) {
  const c=document.getElementById(id); if(c) c.getContext('2d').clearRect(0,0,c.width,c.height);
}
function captureFrame(vid, q=0.88) {
  const v=document.getElementById(vid); if(!v||!v.videoWidth) return null;
  const c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight;
  c.getContext('2d').drawImage(v,0,0); return c.toDataURL('image/jpeg',q);
}
function sleep(ms) { return new Promise(r => setTimeout(r,ms)); }

function loadSavedSettings() {
  const th=parseFloat(localStorage.getItem('matchThreshold')||0.50);
  const fc=parseFloat(localStorage.getItem('faceConf')||0.70);
  const sv=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
  const st=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  sv('threshRange',th); st('threshLabel',th.toFixed(2));
  sv('faceConfRange',fc); st('faceConfLabel',fc.toFixed(2));
  FaceEngine.setThreshold(th); FaceEngine.setMinFaceConf(fc);
}

function startClock() {
  const tick = () => {
    const el = document.getElementById('clockLine');
    if(el) el.textContent = new Date().toLocaleString('en-IN',{
      weekday:'long',year:'numeric',month:'long',day:'numeric',
      hour:'2-digit',minute:'2-digit',second:'2-digit'
    });
  };
  tick(); setInterval(tick, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('threshRange')?.addEventListener('change',
    e => localStorage.setItem('matchThreshold', e.target.value));
  document.getElementById('faceConfRange')?.addEventListener('change',
    e => localStorage.setItem('faceConf', e.target.value));
});
