let CUR_LIST_ID = null;

async function reloadLists(){
  const body = document.getElementById("listsBody");
  body.innerHTML = "";
  const res = await api("GET","/api/lists");
  (res.items||[]).forEach(l=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-id="${l.id}" class="renameInput" value="${l.name}"></td>
      <td>${l.count}</td>
      <td>${l.createdAt ? new Date(l.createdAt).toLocaleString() : ""}</td>
      <td><button class="openList" data-id="${l.id}">Open</button>
          <button class="delList" data-id="${l.id}">Verwijder</button></td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".openList").forEach(b=> b.addEventListener("click", ()=> openList(b.dataset.id)));
  body.querySelectorAll(".delList").forEach(b=> b.addEventListener("click", async ()=>{
    if(!confirm("Lijst verwijderen?")) return;
    await api("DELETE", `/api/lists/${b.dataset.id}`);
    await reloadLists();
    document.getElementById("listPanel").style.display = "none";
  }));
  body.querySelectorAll(".renameInput").forEach(inp=>{
    inp.addEventListener("change", async ()=>{
      await api("PUT", `/api/lists/${inp.dataset.id}`, { name: inp.value.trim() });
      await reloadLists();
    });
  });
}
document.getElementById("btnReloadLists").addEventListener("click", reloadLists);
document.getElementById("btnAddList").addEventListener("click", async ()=>{
  const name = document.getElementById("newListName").value.trim();
  if (!name) return;
  await api("POST","/api/lists",{ name });
  document.getElementById("newListName").value = "";
  await reloadLists();
});

async function openList(id){
  CUR_LIST_ID = id;
  const res = await api("GET", `/api/lists/${id}`);
  document.getElementById("listTitle").textContent = `Lijst: ${res.name}`;
  document.getElementById("listPanel").style.display = "";
  await loadItems();
}
async function loadItems(){
  const res = await api("GET", `/api/lists/${CUR_LIST_ID}/items`);
  const body = document.getElementById("itemsBody");
  body.innerHTML = "";
  (res.items||[]).forEach(it=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="itNorm" data-id="${it.id}" value="${it.normalized||""}"></td>
      <td><input class="itLabel" data-id="${it.id}" value="${it.label||""}" placeholder="label"></td>
      <td>${it.raw||""}</td>
      <td>${it.valid?'<span class="badge ok">OK</span>':'<span class="badge warn">'+(it.reason||'invalid')+'</span>'}</td>
      <td><button class="itSave" data-id="${it.id}">Opslaan</button>
          <button class="itDel" data-id="${it.id}">Verwijderen</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll(".itSave").forEach(b=> b.addEventListener("click", async ()=>{
    const id = b.dataset.id;
    const norm = document.querySelector(`.itNorm[data-id="${id}"]`).value.trim();
    const lab  = document.querySelector(`.itLabel[data-id="${id}"]`).value.trim();
    try { await api("PUT", `/api/lists/${CUR_LIST_ID}/items/${id}`, { normalized:norm, label:lab }); await loadItems(); }
    catch(e){ alert(e.message); }
  }));
  body.querySelectorAll(".itDel").forEach(b=> b.addEventListener("click", async ()=>{
    if(!confirm("Verwijderen?")) return;
    await api("DELETE", `/api/lists/${CUR_LIST_ID}/items/${b.dataset.id}`);
    await loadItems();
  }));
}

function parseRows(text){
  const items = text.split(/[\r\n,]+/g).map(s=>s.trim()).filter(Boolean).map(x=>({raw:x}));
  return items;
}
async function importPaste(){
  const text = document.getElementById("pasteRows").value;
  if (!text.trim()) return;
  const defaultCc = document.getElementById("defaultCc").value.trim() || "+31";
  const assumeTrunk0 = document.getElementById("assumeTrunk0").checked;
  const dedupe = document.getElementById("dedupe").checked;
  const rows = parseRows(text);
  await api("POST", `/api/lists/${CUR_LIST_ID}/items/import`, { rows, defaultCc, assumeTrunk0, dedupe });
  document.getElementById("pasteRows").value = "";
  await loadItems();
}

function extractTelFromVcfText(vcf){
  const lines = vcf.split(/\r?\n/); const out=[];
  for (const line of lines) if (/^TEL/i.test(line)) { const idx=line.indexOf(":"); if (idx>=0){ const num=line.slice(idx+1).trim(); if(num) out.push({raw:num}); } }
  return out;
}
async function importVCF(){
  const f = document.getElementById("vcfFile").files[0];
  if (!f) { alert("Kies een VCF bestand."); return; }
  const text = await f.text();
  const rows = extractTelFromVcfText(text);
  if (!rows.length) { alert("Geen TEL velden gevonden."); return; }
  const defaultCc = document.getElementById("defaultCc").value.trim() || "+31";
  const assumeTrunk0 = document.getElementById("assumeTrunk0").checked;
  const dedupe = document.getElementById("dedupe").checked;
  await api("POST", `/api/lists/${CUR_LIST_ID}/items/import`, { rows, defaultCc, assumeTrunk0, dedupe });
  document.getElementById("vcfFile").value = "";
  await loadItems();
}

document.getElementById("btnImportPaste").addEventListener("click", importPaste);
document.getElementById("btnImportVCF").addEventListener("click", importVCF);
document.getElementById("btnDedupe").addEventListener("click", async ()=>{ await api("PUT", `/api/lists/${CUR_LIST_ID}/items`, { action:"dedupe" }); await loadItems(); });
document.getElementById("btnAutoFix").addEventListener("click", async ()=>{ await api("PUT", `/api/lists/${CUR_LIST_ID}/items`, { action:"autofix_nl" }); await loadItems(); });
document.getElementById("btnDeleteInvalid").addEventListener("click", async ()=>{ await api("PUT", `/api/lists/${CUR_LIST_ID}/items`, { action:"delete_invalid" }); await loadItems(); });

reloadLists().catch(()=>{});
