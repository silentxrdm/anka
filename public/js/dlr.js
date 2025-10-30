async function loadCampaigns(){
  const sel = document.getElementById("campaignSel");
  sel.innerHTML = "";
  const res = await api("GET","/api/campaigns");
  (res.items||[]).forEach(c=>{
    const opt = document.createElement("option");
    const title = `#${c.campaign_id||"?"} | ${new Date(c.createdAt).toLocaleString()} | ${c.sender_id||""}`;
    opt.value = c.campaign_id || ""; opt.textContent = title;
    sel.appendChild(opt);
  });
}
document.getElementById("btnDLR").addEventListener("click", async ()=>{
  const sel = document.getElementById("campaignSel");
  const opt = sel.selectedOptions[0];
  const id = document.getElementById("campaignId").value.trim() || (opt?opt.value:"");
  const out = document.getElementById("dlrOut");
  if (!id) { out.textContent = "Geen campaign id."; return; }
  out.textContent = "Ophalen...";
  try { const res = await api("GET", `/api/dlr/${encodeURIComponent(id)}`); out.textContent = JSON.stringify(res,null,2); }
  catch(e){ out.textContent = e.message; }
});
loadCampaigns().catch(()=>{});
