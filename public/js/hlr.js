document.getElementById("btnHLR").addEventListener("click", async ()=>{
  const to = document.getElementById("hlrCsv").value.trim();
  const out = document.getElementById("hlrOut");
  if (!to) { out.textContent = "Geen nummers."; return; }
  out.textContent = "Versturen...";
  try { const res = await api("POST","/api/hlr",{ to }); out.textContent = JSON.stringify(res,null,2);
    if (res.job_id) document.getElementById("hlrJob").value = res.job_id;
  } catch(e){ out.textContent = e.message; }
});
document.getElementById("btnHLRStatus").addEventListener("click", async ()=>{
  const id = document.getElementById("hlrJob").value.trim();
  const out = document.getElementById("hlrOut"); if (!id) { out.textContent = "Geen job id."; return; }
  out.textContent = "Ophalen...";
  try { const res = await api("GET", `/api/hlr/${encodeURIComponent(id)}`); out.textContent = JSON.stringify(res,null,2); }
  catch(e){ out.textContent = e.message; }
});
