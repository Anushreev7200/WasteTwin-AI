(() => {
  const cfg = window.WASTETWIN_CONFIG || { DEMO_MODE: true, API_BASE_URL: "" };
  const $ = (id) => document.getElementById(id);
  const form = $("reportForm");
  const demoKey = "wastetwin_demo_reports_v1";
  const sampleReports = [
    {reportId:"demo-101",title:"Plastic waste beside community park",description:"Plastic wrappers and bottles collected near the entrance.",category:"Plastic",severity:"High",location:"Coimbatore — sample location",latitude:11.0168,longitude:76.9558,status:"Pending Verification",createdAt:new Date(Date.now()-26*3600000).toISOString()},
    {reportId:"demo-102",title:"Construction debris on roadside",description:"Broken bricks and rubble occupy part of the walkway.",category:"Construction debris",severity:"Medium",location:"Gandhipuram — sample location",latitude:11.0183,longitude:76.9674,status:"In Progress",createdAt:new Date(Date.now()-12*3600000).toISOString()},
    {reportId:"demo-103",title:"Overflowing public bin",description:"Waste has spilled outside the bin.",category:"Household waste",severity:"Critical",location:"Ukkadam — sample location",latitude:10.9925,longitude:76.9614,status:"Reported",createdAt:new Date(Date.now()-3*3600000).toISOString()},
    {reportId:"demo-104",title:"E-waste collection point cleared",description:"Sample resolved record for dashboard demonstration.",category:"E-waste",severity:"Low",location:"Peelamedu — sample location",latitude:11.0245,longitude:77.0012,status:"Resolved",createdAt:new Date(Date.now()-50*3600000).toISOString()}
  ];
  let reports = [];
  let map, markerLayer;
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function priority(r) {
    const weights = {Low:10,Medium:25,High:40,Critical:55};
    const age = Math.max(0, (Date.now() - new Date(r.createdAt || Date.now()).getTime()) / 3600000);
    const bonus = Math.min(30, Math.floor(age / 6) * 3);
    const category = ["hazardous","illegal dumping"].includes(String(r.category).toLowerCase()) ? 15 : 0;
    const score = (weights[r.severity] || 25) + bonus + category;
    return {score, label: score >= 75 ? "Critical" : score >= 50 ? "High" : score >= 25 ? "Medium" : "Low"};
  }
  function seedDemo() {
    if (!localStorage.getItem(demoKey)) localStorage.setItem(demoKey, JSON.stringify(sampleReports));
    return JSON.parse(localStorage.getItem(demoKey) || "[]");
  }
  async function api(path, options={}) {
    const res = await fetch(cfg.API_BASE_URL.replace(/\/$/, "") + path, {
      ...options, headers: {"Content-Type":"application/json", ...(options.headers || {})}
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  async function loadReports() {
    if (cfg.DEMO_MODE) reports = seedDemo();
    else {
      if (!cfg.API_BASE_URL || cfg.API_BASE_URL.includes("REPLACE-WITH")) throw new Error("Set API_BASE_URL in frontend/config.js first.");
      const data = await api("/reports");
      reports = data.reports || [];
    }
    reports = reports.map(r => ({...r, ...priority(r)}));
    render();
  }
  function render() {
    const resolved = reports.filter(r=>r.status==="Resolved").length;
    $("totalCount").textContent = reports.length;
    $("attentionCount").textContent = reports.filter(r=>["High","Critical"].includes(r.priority)).length;
    $("progressCount").textContent = reports.filter(r=>r.status==="In Progress").length;
    $("resolvedCount").textContent = resolved;
    $("resolvedRate").textContent = reports.length ? `${Math.round(resolved/reports.length*100)}%` : "0%";
    $("demoNotice").classList.toggle("hidden", !cfg.DEMO_MODE);
    $("connectionBadge").textContent = cfg.DEMO_MODE ? "● Demo mode" : "● AWS connected";
    $("connectionBadge").style.background = cfg.DEMO_MODE ? "#fff4dc" : "#e5f5ec";
    $("connectionBadge").style.color = cfg.DEMO_MODE ? "#946515" : "#28744b";
    renderTable(); renderMap();
  }
  function renderTable() {
    const query = $("searchInput").value.toLowerCase();
    const status = $("statusFilter").value;
    const filtered = reports.filter(r => (status==="All" || r.status===status) &&
      [r.title,r.category,r.location,r.description].join(" ").toLowerCase().includes(query));
    const body = $("reportsBody");
    if (!filtered.length) { body.innerHTML = '<tr><td colspan="6" class="empty">No reports match these filters.</td></tr>'; return; }
    body.innerHTML = filtered.map(r => {
      const p = priority(r);
      const date = new Date(r.createdAt).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
      const statuses = ["Reported","Pending Verification","In Progress","Resolved"];
      return `<tr>
        <td><div class="report-title">${escapeHtml(r.title)}</div><div class="report-meta">#${escapeHtml(r.reportId.slice(0,8))} · ${escapeHtml(date)}</div></td>
        <td>${escapeHtml(r.category)}</td>
        <td><span class="priority priority-${p.label.toLowerCase()}">${p.label} · ${p.score}</span></td>
        <td>${escapeHtml(r.location)}</td>
        <td><span class="status-pill status-${r.status.toLowerCase().replaceAll(" ","-")}">${escapeHtml(r.status)}</span></td>
        <td><select class="status-select" data-id="${escapeHtml(r.reportId)}" aria-label="Update status for ${escapeHtml(r.title)}">${statuses.map(s=>`<option ${r.status===s?"selected":""}>${s}</option>`).join("")}</select></td>
      </tr>`;
    }).join("");
    body.querySelectorAll("select[data-id]").forEach(sel => sel.addEventListener("change", async e => {
      const id = e.target.dataset.id, statusValue = e.target.value;
      try {
        if (cfg.DEMO_MODE) {
          reports = reports.map(r=>r.reportId===id?{...r,status:statusValue}:r);
          localStorage.setItem(demoKey, JSON.stringify(reports));
        } else await api(`/reports/${encodeURIComponent(id)}`, {method:"PATCH",body:JSON.stringify({status:statusValue})});
        await loadReports();
      } catch(err) { showMessage(err.message, true); await loadReports(); }
    }));
  }
  function renderMap() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const points = reports.filter(r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)) && r.latitude!=="" && r.longitude!=="");
    points.forEach(r => {
      const p=priority(r);
      const marker=L.circleMarker([Number(r.latitude),Number(r.longitude)],{radius:8,color:p.label==="Critical"||p.label==="High"?"#c94b4b":"#147d57",fillOpacity:.8,weight:2});
      marker.bindPopup(`<b>${escapeHtml(r.title)}</b><br>${escapeHtml(r.location)}<br>Priority: ${p.label}<br>Status: ${escapeHtml(r.status)}`);
      marker.addTo(markerLayer);
    });
    $("mappedCount").textContent = `${points.length} mapped`;
    if (points.length) map.fitBounds(L.latLngBounds(points.map(r=>[Number(r.latitude),Number(r.longitude)])),{padding:[25,25],maxZoom:13});
  }
  function showMessage(msg, error=false) {
    $("formMessage").textContent=msg;
    $("formMessage").classList.toggle("error",error);
  }
  $("photoInput").addEventListener("change",()=>{$("photoName").textContent=$("photoInput").files[0]?.name || "Choose file";});
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const button=$("submitBtn"); button.disabled=true; button.textContent="Submitting…"; showMessage("");
    try {
      const fd=new FormData(form);
      const report={
        title:fd.get("title").trim(), description:fd.get("description").trim(), category:fd.get("category"),
        severity:fd.get("severity"), location:fd.get("location").trim(),
        latitude:fd.get("latitude") || "", longitude:fd.get("longitude") || ""
      };
      const file=$("photoInput").files[0];
      if (file && !file.type.startsWith("image/")) throw new Error("Please choose an image file.");
      if (file && cfg.DEMO_MODE) report.photoName=file.name;
      if (cfg.DEMO_MODE) {
        report.reportId="demo-"+Date.now(); report.createdAt=new Date().toISOString(); report.status="Reported";
        reports.unshift(report); localStorage.setItem(demoKey,JSON.stringify(reports));
      } else {
        if (file) {
          const upload=await api("/upload-url",{method:"POST",body:JSON.stringify({filename:file.name,contentType:file.type || "image/jpeg"})});
          const put=await fetch(upload.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type || "image/jpeg"},body:file});
          if (!put.ok) throw new Error("Photo upload failed. Check S3 bucket CORS and try again.");
          report.photoKey=upload.photoKey;
        }
        await api("/reports",{method:"POST",body:JSON.stringify(report)});
      }
      form.reset(); $("photoName").textContent="Choose file";
      showMessage("Report submitted successfully.");
      await loadReports();
    } catch(err) { showMessage(err.message || "Unable to submit report.",true); }
    finally { button.disabled=false; button.innerHTML='Submit waste report <span>→</span>'; }
  });
  $("searchInput").addEventListener("input",renderTable);
  $("statusFilter").addEventListener("change",renderTable);
  $("refreshBtn").addEventListener("click",()=>loadReports().catch(err=>showMessage(err.message,true)));
  function initMap() {
    if (!window.L) { $("map").innerHTML='<p style="padding:20px">Map library unavailable. Check your internet connection.</p>'; return; }
    map=L.map("map").setView([11.0168,76.9558],12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    markerLayer=L.layerGroup().addTo(map);
  }
  initMap();
  loadReports().catch(err=>{ $("connectionBadge").textContent="Connection error"; showMessage(err.message,true); $("reportsBody").innerHTML=`<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`; });
})();
