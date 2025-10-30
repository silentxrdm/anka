document.getElementById("btnAccount").addEventListener("click", async ()=>{
  const out = document.getElementById("accountOut");
  out.textContent = "Laden...";
  try { const data = await api("GET","/api/account"); out.innerHTML = `<pre class="mono">${JSON.stringify(data,null,2)}</pre>`; }
  catch(e){ out.textContent = e.message; }
});
