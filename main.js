// Every day is Jueves — front-end only
// Data pipeline: Google News RSS -> rss2json -> Pollinations (text+image)

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const statusEl = $("#status");
const gridEl = $("#news-grid");
const fetchBtn = $("#fetch-btn");
const selectEl = $("#country-select");
$("#year").textContent = new Date().getFullYear();

// --- Editions: hl (language-region), gl (country), ceid (country:lang) ---
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

// Populate select
for (const ed of EDITIONS){
  const opt = document.createElement("option");
  opt.value = ed.key;
  opt.textContent = ed.label;
  selectEl.appendChild(opt);
}
// Default to Spain
selectEl.value = "ES_ES";

fetchBtn.addEventListener("click", async () => {
  const ed = EDITIONS.find(e => e.key === selectEl.value) || EDITIONS[0];
  await loadTopNews(ed);
});

async function loadTopNews(edition){
  gridEl.innerHTML = "";
  setStatus("Cargando titulares…");
  try{
    const rssUrl = buildGoogleNewsRSS(edition);
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
    const res = await fetch(apiUrl);
    if(!res.ok){ throw new Error(`rss2json error: ${res.status}`); }
    const data = await res.json();
    const items = (data.items || []).slice(0,5);
    if(items.length === 0){
      setStatus("No se encontraron noticias para esta edición.");
      return;
    }
    setStatus(`Mostrando ${items.length} titulares para ${edition.label}.`);
    // Render placeholders
    for (let idx=0; idx<items.length; idx++){
      renderCard(idx, items[idx], edition);
    }
    // Process sequentially (avoid hammering endpoints)
    for (let idx=0; idx<items.length; idx++){
      await processCard(idx, items[idx], edition);
    }
  }catch(err){
    console.error(err);
    setStatus("Error al cargar noticias. Reintenta más tarde.");
  }
}

function buildGoogleNewsRSS({hl, gl, ceid}){
  return `https://news.google.com/rss?hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
}

function setStatus(msg){
  statusEl.textContent = msg;
}

// Render static frame of a card
function renderCard(index, item, edition){
  const card = document.createElement("article");
  card.className = "card";
  card.id = `card-${index}`;

  const pub = item.pubDate ? new Date(item.pubDate) : null;
  const when = pub ? pub.toLocaleString(edition.lang || 'es', {dateStyle:'medium', timeStyle:'short'}) : "";

  card.innerHTML = `
    <div class="thumb-wrap" id="thumb-${index}">
      <!-- image goes here -->
    </div>
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

// Process: summarize -> image
async function processCard(index, item, edition){
  const sumEl = $(`#summary-${index}`);
  const thumbEl = $(`#thumb-${index}`);
  const rerollBtn = $(`#reroll-${index}`);
  const openBtn = $(`#open-${index}`);
  const noteEl = $(`#note-${index}`);

  const lang = pickLanguage(edition);
  const articleText = [item.title, item.description || item.contentSnippet || ""].filter(Boolean).join(". ");
  const summary = await summarizeWithPollinations(articleText, lang).catch(()=>null);
  if(!summary){
    sumEl.textContent = "No se pudo resumir la noticia.";
    return;
  }
  sumEl.textContent = summary;

  // First image
  let seed = Math.floor(Math.random()*1e9);
  const imgUrl = buildPollinationsImageUrl(buildCaricaturePrompt(summary, lang), seed);
  paintImage(thumbEl, imgUrl, seed);
  rerollBtn.disabled = false;
  openBtn.disabled = false;

  rerollBtn.addEventListener("click", () => {
    seed = Math.floor(Math.random()*1e9);
    const url = buildPollinationsImageUrl(buildCaricaturePrompt(summary, lang), seed);
    paintImage(thumbEl, url, seed);
  });
  openBtn.addEventListener("click", () => {
    window.open(imgUrl, "_blank", "noopener,noreferrer");
  });

  noteEl.innerHTML = `
    Prompt base: <em>“Make an exaggerated funny caricature describing the following news…”</em>.
    Semilla: <strong>${seed}</strong> &middot; Fuente: <a href="${item.link}" target="_blank" rel="noopener">artículo</a>
  `;
}

// Decide language for summaries / prompts
function pickLanguage(edition){
  // Prefer Spanish for Spanish-speaking editions; else fall back to edition.lang or English.
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
  // Pollinations image endpoint. Keep simple and keyless.
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}`;
  return url;
}

async function summarizeWithPollinations(text, lang="es"){
  const prompt = buildSummaryPrompt(text, lang);
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
  const res = await fetch(url, {headers:{'Accept':'text/plain'}});
  if(!res.ok) throw new Error("Pollinations text failed");
  const out = await res.text();
  return cleanOneLine(out);
}

function buildSummaryPrompt(text, lang){
  // Keep it short and visual; avoid names/logos to be safer for caricature prompts.
  const trimmed = text.replace(/\s+/g," ").trim().slice(0, 1200);
  if (lang.startsWith("es")){
    return `Resume en una sola frase la siguiente noticia en español, destacando objetos y escenas visuales útiles para una viñeta satírica. Evita nombres propios y logotipos. Devuelve solo la frase. Noticia: ${trimmed}`;
  } else if (lang.startsWith("fr")){
    return `Résume en une seule phrase la nouvelle suivante en français, en mettant en avant des éléments visuels pour une caricature satirique. Pas de noms propres ni logos. Retourne uniquement la phrase. Nouvelle: ${trimmed}`;
  } else if (lang.startsWith("de")){
    return `Fasse die folgende Nachricht in einem einzigen Satz auf Deutsch zusammen, mit visuellen Elementen für eine satirische Karikatur. Keine Eigennamen oder Logos. Gib nur den Satz zurück. Nachricht: ${trimmed}`;
  } else if (lang.startsWith("it")){
    return `Riassumi in una sola frase la seguente notizia in italiano, evidenziando elementi visivi per una vignetta satirica. Evita nomi propri e loghi. Restituisci solo la frase. Notizia: ${trimmed}`;
  } else if (lang.startsWith("pt")){
    return `Resuma em uma única frase a seguinte notícia em português, destacando elementos visuais para uma caricatura satírica. Evite nomes próprios e logotipos. Devolva apenas a frase. Notícia: ${trimmed}`;
  }
  // default English
  return `Summarize the following news in one sentence in English, emphasizing concrete visual elements useful for a satirical caricature. Avoid proper names and logos. Return only the sentence. News: ${trimmed}`;
}

// Helpers
function escapeHtml(str=""){
  return str.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function cleanOneLine(s=""){
  return s.replace(/\s+/g," ").replace(/^"+|"+$/g,"").trim();
}

// Auto-load default
loadTopNews(EDITIONS.find(e => e.key==="ES_ES"));
