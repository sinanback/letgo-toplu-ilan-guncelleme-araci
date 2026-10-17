(function(root) {
  'use strict';
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const money = s => {
    const m = norm(s).match(/^(\d[\d.]*)(?:,(\d{1,2}))?\s*TL$/);
    return m ? Number(m[1].replace(/\./g, '')) + Number(m[2] || 0) / (m[2]?.length === 1 ? 10 : 100) : null;
  };
  const listURL = s => {
    try { const u = new URL(s); return u.origin === 'https://www.letgo.com' && u.pathname === '/ilanlarim' && u.searchParams.get('status') === 'outdated'; } catch { return false; }
  };
  const phase = (pathname, id) => {
    if (pathname === '/ilanlarim') return 'list';
    if (pathname === `/ilan-duzenle/${id}/bilgiler`) return 'info';
    if (pathname === `/ilan-duzenle/${id}/ozellikler`) return 'features';
    if (pathname === `/ilan-duzenle/${id}/teslimat`) return 'delivery';
    if (pathname === `/hizli-sat/${id}`) return 'vitamin';
    if (pathname === '/onay') return 'success';
    return 'unknown';
  };
  const next = {list:'info', info:'features', features:'delivery', delivery:'vitamin', vitamin:'success'};
  const api = {norm, money, listURL, phase, next};
  root.LetgoCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
