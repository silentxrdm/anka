async function api(method, url, body){
  const res = await fetch(url, { method, headers:{ "Content-Type":"application/json" }, body: body?JSON.stringify(body):undefined });
  let data={}; try{ data = await res.json(); }catch{}
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function setActiveNav(id){
  document.querySelectorAll("nav a").forEach(a=>a.classList.remove("active"));
  const el = document.getElementById(id); if (el) el.classList.add("active");
}
function isE164(s){ return /^\+\d{7,15}$/.test(s); }
function normalizeLocal(raw, defaultCc="+31", assumeTrunk0=true){
  if (!raw) return { out:"", reason:"empty" };
  let s = String(raw).trim().replace(/[\s\-().]+/g,"");
  if (s.startsWith("00")) s = "+" + s.slice(2).replace(/\D/g,"");
  else if (s.startsWith("+")) s = "+" + s.slice(1).replace(/\D/g,"");
  else {
    s = s.replace(/\D/g,"");
    if (!s) return { out:"", reason:"nodigits" };
    if (assumeTrunk0 && s.startsWith("0")) { s = s.slice(1); s = (defaultCc||"+31")+s; }
    else s = (defaultCc||"+31")+s;
  }
  if (!isE164(s)) return { out:s, reason:"not_e164" };
  if (s.startsWith("+316")) {
    const rest = s.slice(4);
    if (rest.length !== 8) return { out:s, reason:"nl_length" };
  }
  return { out:s, reason:"ok" };
}
function gsmLimit(isUnicode){ return isUnicode?70:160; }
function updateCounter(textarea, counterEl, isUnicode){
  const limit = gsmLimit(isUnicode);
  textarea.setAttribute("maxlength", String(limit));
  if (textarea.value.length>limit) textarea.value = textarea.value.slice(0,limit);
  const used = textarea.value.length, left = limit-used;
  counterEl.textContent = `${used} / ${limit} (over: ${left})`;
  counterEl.classList.toggle("warn", left <= 20 && left >= 0);
  counterEl.classList.toggle("error", left < 0);
}
function parseCsvNumbers(raw){
  const parts = raw.split(/[\r\n,]+/g).map(x=>x.trim()).filter(Boolean);
  const cleaned = parts.map(p=>{
    let s = p.replace(/\s+/g,"");
    if (s.startsWith("+")) s = "+"+s.slice(1).replace(/\D/g,"");
    else if (s.startsWith("00")) s = "+"+s.slice(2).replace(/\D/g,"");
    else s = s.replace(/\D/g,"");
    return s;
  }).filter(Boolean);
  return Array.from(new Set(cleaned)).join(",");
}
