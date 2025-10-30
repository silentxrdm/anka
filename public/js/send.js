async function loadLists(){
  const sel = document.getElementById("listSelect");
  sel.innerHTML = "";
  const res = await api("GET","/api/lists");
  (res.items||[]).forEach(l=>{
    const opt = document.createElement("option");
    opt.value = l.id; opt.textContent = `${l.name} (${l.count})";
    sel.appendChild(opt);
  });
}
function selectedListIds(){
  return Array.from(document.getElementById("listSelect").selectedOptions).map(o=>o.value);
}
function currentIsUnicode(){ return document.getElementById("unicode").value === "true"; }
function doUpdateCounter(){
  updateCounter(document.getElementById("message_content"), document.getElementById("msgCounter"), currentIsUnicode());
}
document.getElementById("unicode").addEventListener("change", doUpdateCounter);
document.getElementById("message_content").addEventListener("input", doUpdateCounter);
doUpdateCounter();

document.getElementById("btnPreview").addEventListener("click", async ()=>{
  const list_ids = selectedListIds();
  const extraCsv = document.getElementById("extraCsv").value;
  const extra = parseCsvNumbers(extraCsv).split(",").filter(Boolean).map(x=>normalizeLocal(x,"+31",true).out).filter(Boolean);
  const out = document.getElementById("previewOut");
  out.textContent = `Lijsten: ${list_ids.length} | Extra (na normalisatie): ${extra.length} nummers`;
});

document.getElementById("btnSend").addEventListener("click", async ()=>{
  const list_ids = selectedListIds();
  const extra_to_csv = document.getElementById("extraCsv").value;
  const sender_id = document.getElementById("sender_id").value.trim();
  const message_content = document.getElementById("message_content").value;
  const unicode = currentIsUnicode();

  const out = document.getElementById("sendOut");
  out.textContent = "Versturen...";
  try {
    const res = await api("POST","/api/send",{ list_ids, extra_to_csv, sender_id, message_content, unicode });
    out.innerHTML = `<pre class="mono">${JSON.stringify(res,null,2)}</pre>
    <div><a href="/dlr.html">Ga naar DLR pagina</a></div>`;
  } catch(e){ out.textContent = e.message; }
});

loadLists().catch(()=>{});
