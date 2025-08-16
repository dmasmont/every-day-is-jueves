// Every day is Jueves — front-end only (with debug, retries, throttling, top-3)
const $ = (sel, root=document) => root.querySelector(sel);

const statusEl = $("#status");
const gridEl = $("#news-grid");
const fetchBtn = $("#fetch-btn");
const selectEl = $("#country-select");
const debugToggle = $("#debug-toggle");
const debugPanel = $("#debug-panel");
const debugLog = $("#debug-log");
$("#year").textContent = new Date().getFullYear();

let DEBUG = false;
debugToggle.addEventListener("change", () => {
  DEBUG = debugToggle.checked;
  debugPanel.hidden = !DEBUG;
});

function logDebug(...args){
  if(!DEBUG) return;
  const msg = args.map(a => {
    try { return typeof a === "string" ? a : JSON.stringify(a, null, 2); }
    catch(e){ return String(a); }
  }).join(" ");
  console.log("[Jueves]", ...args);
  debugLog.textContent += (msg + "\n");
}

const EDITIONS = [
  {key: "INTL_EN", label: "International (English)", hl:"en-US", gl:"US", ceid:"US:en", lang:"en"},
  {key: "ES_ES", label: "España (Español)", hl:"es-ES", gl:"ES", ceid:"ES:es", lang:"es"},
  {key: "MX_ES", label: "México (Español)", hl:"es-419", gl:"MX", ceid:"MX:es-419", lang:"es"},
  {key: "AR_ES", label: "Argentina (Español)", hl:"es-419", gl:"AR", ceid:"AR:es-419", lang:"es"},
  {key: "CL_ES", label: "Chile (Español)", hl:"es-419", gl:"CL", ceid:"CL:es-419", lang:"es"},
  {key: "CO_ES", label: "Colombia (Español)", hl:"es-419", gl:"CO", ceid:"CO:es-419", lang:"es"},
  {key: "US_EN", label: "United States (English)", hl:"en-US", gl:"US", ceid:"US:en", lang:"en"},
  {key: "GB_EN", label: "United Kingdom (English)", hl:"en-GB", gl:"GB", ceid:"GB:en-GB", lang:"en"},
  {key: "FR_FR", label: "France (Français)", hl:"fr-FR", gl:"FR", ceid:"FR:fr", lang:"fr"},
  {key: "DE_DE", label: "Deutschland (Deutsch)", hl:"de-DE", gl:"DE", ceid:"DE:de", lang:"de"},
  {key: "IT_IT", label: "Italia (Italiano)", hl:"it-IT", gl:"IT", ceid:"IT:it", lang:"it"},
  {key: "PT_PT", label: "Portugal (Português)", hl:"pt-PT", gl:"PT", ceid:"PT:pt-PT", lang:"pt"},
  {key: "BR_PT", label: "Brasil (Português)", hl:"pt-BR", gl:"BR", ceid:"BR:pt-BR", lang:"pt"},
];

for (const ed of EDITIONS){
  const opt = document.createElement("option");
  opt.value = ed.key;
  opt.textContent = ed.label;
  selectEl.appendChild(opt);
}
selectEl.value = "ES_ES";

fetchBtn.addEventListener("click", async () => {
  debugLog.textContent = "";
  const ed = EDITIONS.find(e => e.key === selectEl.value) || EDITIONS[0];
  await loadTopNews(ed);
});

async function loadTopNews(edition){
  gridEl.innerHTML = "";
  setStatus("Cargando titulares…");
  try{
    const rssUrl = buildGoogleNewsRSS(edition);
    const endpoints = [
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`,
      `https://rss2json.com/api.json?rss_url=${encodeURIComponent(rssUrl)}` // fallback
    ];
    let data = null, lastErr = null;
    for (const apiUrl of endpoints){
      try {
        logDebug("Fetch RSS->JSON:", apiUrl);
        data = await fetchJsonWithRetry(apiUrl, 2);
        break;
      } catch(e){
        lastErr = e;
        logDebug("RSS fetch failed:", e.message || e);
      }
    }
    if (!data) throw lastErr || new Error("rss2json failed on all endpoints.");

    const items = (data.items || []).slice(0,3);
    if(items.length === 0){
      setStatus("No se encontraron noticias para esta edición.");
      return;
    }
    setStatus(`Mostrando ${items.length} titulares para ${edition.label}.`);

    for (let idx=0; idx<items.length; idx++){
      renderCard(idx, items[idx], edition);
    }

    // Process sequentially with throttling to avoid rate limits
    for (let idx=0; idx<items.length; idx++){
      await processCard(idx, items[idx], edition);
      await sleep(700); // throttle between items
    }
  }catch(err){
    console.error(err);
    setStatus("Error al cargar noticias. Reintenta más tarde.");
    logDebug("Top-level error:", err?.stack || err?.message || String(err));
  }
}

function buildGoogleNewsRSS({hl, gl, ceid}){
  return `https://news.google.com/rss?hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
}

function setStatus(msg){ statusEl.textContent = msg; }

function renderCard(index, item, edition){
  const card = document.createElement("article");
  card.className = "card";
  card.id = `card-${index}`;

  const pub = item.pubDate ? new Date(item.pubDate) : null;
  const when = pub ? pub.toLocaleString(edition.lang || 'es', {dateStyle:'medium', timeStyle:'short'}) : "";

  card.innerHTML = `
    <div class="thumb-wrap" id="thumb-${index}"></div>
    <div class="card-head">
      <span class="badge">Top News</span>
      <h3><a href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "Titular")}</a></h3>
      <div class="meta">${when}</div>
    </div>
    <div class="card-body">
      <div class="summary" id="summary-${index}">Resumiendo noticia…</div>
      <div class="actions">
        <button class="btn secondary" id="reroll-${index}" disabled>Re-roll</button>
        <button class="btn" id="open-${index}" disabled>Abrir imagen</button>
      </div>
    </div>
    <div class="footer-note" id="note-${index}"></div>
  `;
  gridEl.appendChild(card);
}

async function processCard(index, item, edition){
  const sumEl = document.querySelector(`#summary-${index}`);
  const thumbEl = document.querySelector(`#thumb-${index}`);
  const rerollBtn = document.querySelector(`#reroll-${index}`);
  const openBtn = document.querySelector(`#open-${index}`);
  const noteEl = document.querySelector(`#note-${index}`);

  const lang = pickLanguage(edition);
  const articleText = [item.title, item.description || item.contentSnippet || ""].filter(Boolean).join(". ");
  let summary = null;
  try{
    summary = await summarizeWithPollinations(articleText, lang);
  }catch(e){
    logDebug(`Summarize failed [${index}]`, e?.message || e);
    sumEl.textContent = `No se pudo resumir la noticia: ${e?.message || "error desconocido"}`;
    return;
  }
  sumEl.textContent = summary;

  let seed = Math.floor(Math.random()*1e9);
  let imgUrl = buildPollinationsImageUrl(buildImagePromptFromTitle(item.title), seed);
  logDebug(`Image URL [${index}]`, imgUrl);

  let attemptedAutoReroll = false;
  paintImage(thumbEl, imgUrl, seed, async (ok, err) => {
    if(!ok){
      logDebug(`Image load error [${index}]`, err?.message || err);
      noteEl.innerHTML = `⚠️ No se pudo cargar la imagen (quizá límite de tasa). Puedes reintentar con <strong>Re-roll</strong>.`;
      // Try one automatic re-roll after a short delay
      if(!attemptedAutoReroll){
        attemptedAutoReroll = true;
        await sleep(900);
        seed = Math.floor(Math.random()*1e9);
        imgUrl = buildPollinationsImageUrl(buildImagePromptFromTitle(item.title), seed);
        logDebug(`Auto Re-roll URL [${index}]`, imgUrl);
        paintImage(thumbEl, imgUrl, seed);
      }
    }
  });

  rerollBtn.disabled = false;
  openBtn.disabled = false;

  rerollBtn.addEventListener("click", () => {
    seed = Math.floor(Math.random()*1e9);
    imgUrl = buildPollinationsImageUrl(buildImagePromptFromTitle(item.title), seed);
    logDebug(`Re-roll URL [${index}]`, imgUrl);
    paintImage(thumbEl, imgUrl, seed);
  });
  openBtn.addEventListener("click", () => {
    window.open(imgUrl, "_blank", "noopener,noreferrer");
  });

  noteEl.innerHTML = `
    Prompt base: <em>“Generate a highly exaggerated funny caricature of this new: ${escapeHtml(item.title || "")}”</em>.
    Semilla: <strong>${seed}</strong> &middot; Fuente: <a href="${item.link}" target="_blank" rel="noopener">artículo</a>
  `;
}

function pickLanguage(edition){
  const esKeys = ["ES_ES","MX_ES","AR_ES","CL_ES","CO_ES"];
  if (esKeys.includes(edition.key)) return "es";
  return edition.lang || "en";
}

function buildCaricaturePrompt(summary, lang){
  const base = "Make an exaggerated funny caricature describing the following news:";
  const style = "Spanish satirical magazine style, bold ink outlines, vibrant flat colors, political cartoon composition, dynamic perspective, no text or words, no logos, high detail";
  return `${base} ${summary}. Style: ${style}.`;
}

function buildPollinationsImageUrl(prompt, seed){
  // Add explicit size to avoid giant defaults; add seed for reproducibility.
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=768&height=768`;
}

function buildImagePromptFromTitle(newsTitle){
  const title = cleanOneLine(newsTitle || "");
  return `Generate a highly exaggerated funny caricature of this new: ${title}`;
}

async function summarizeWithPollinations(text, lang="es"){
  const prompt = buildSummaryPrompt(text, lang);
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
  logDebug("Summarize URL:", url.slice(0, 180) + (url.length>180 ? " …" : ""));
  const res = await fetchWithRetry(url, { headers:{'Accept':'text/plain'} }, 3);
  const out = await res.text();
  // Sometimes proxies return HTML or JSON error bodies; guard against that to surface clearer errors
  const sample = out.slice(0, 200).toLowerCase();
  if (sample.includes("<html") || sample.includes("<body") || sample.includes("{\"error\"") || sample.includes("cloudflare") ){
    throw new Error("Servicio de texto devolvió una respuesta inesperada");
  }
  return cleanOneLine(out);
}

function buildSummaryPrompt(text, lang){
  const trimmed = text.replace(/\s+/g," ").trim().slice(0, 600);
  return `Given this new, provide a funny caricaturized and comedic summary of the news, keep the original language: ${trimmed}`;
}

// --- Helpers & utilities ---
function escapeHtml(str=""){ return str.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function cleanOneLine(s=""){ return s.replace(/\s+/g," ").replace(/^"+|"+$/g,"").trim(); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJsonWithRetry(url, retries=1){
  const res = await fetchWithRetry(url, {}, retries);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    const text = await res.text();
    throw new Error(`Expected JSON but got ${ct}. Body starts: ${text.slice(0,200)}`);
  }
  return res.json();
}

async function fetchWithRetry(url, options={}, retries=1){
  let attempt=0, lastErr=null;
  while (attempt <= retries){
    try{
      const res = await fetch(url, options);
      if(!res.ok){
        // Helpful logging for CORS/429/5xx
        logDebug(`HTTP ${res.status} on ${url.slice(0, 160)}${url.length>160?" …":""}`);
        if (res.status === 429) throw new Error("Rate limited (429).");
        if (res.status >= 500) throw new Error(`Server error (${res.status}).`);
        if (res.status >= 400) throw new Error(`Client error (${res.status}).`);
      }
      return res;
    }catch(e){
      lastErr = e;
      if (attempt === retries) break;
      await sleep(700 * (attempt + 1)); // slightly longer backoff
      attempt++;
    }
  }
  throw lastErr || new Error("fetchWithRetry failed");
}

function paintImage(container, url, seed, cb){
  container.innerHTML = "";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = "Caricatura generada por IA";
  img.src = url;
  img.addEventListener("load", () => cb?.(true));
  img.addEventListener("error", (e) => cb?.(false, e));
  container.appendChild(img);
}

// Auto-load default
(async () => {
  // Try to load default quietly; user can toggle Debug to see details
  const ed = {key:"ES_ES", hl:"es-ES", gl:"ES", ceid:"ES:es", label:"España (Español)", lang:"es"};
  await loadTopNews(ed);
})();