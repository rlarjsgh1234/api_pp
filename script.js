const API = "https://pokeapi.co/api/v2";
const N = 16;
const TYPE_COLORS = {normal:"#9fa19f",fire:"#e8622c",water:"#3b8fe0",electric:"#e5b800",grass:"#3fa129",ice:"#3ec6e8",
  fighting:"#c03028",poison:"#9141cb",ground:"#a9792a",flying:"#6d9fe8",psychic:"#ee4f8a",bug:"#8fa31a",
  rock:"#a5985a",ghost:"#6a4470",dragon:"#4f60e2",dark:"#50413f",steel:"#5a8ea1",fairy:"#e87fe8"};
const STAT_KO = {hp:"HP",attack:"공격",defense:"방어","special-attack":"특공","special-defense":"특방",speed:"스피드"};
const FORM_KO = {mega:"메가",x:"X",y:"Y",gmax:"거다이맥스",alola:"알로라",galar:"가라르",hisui:"히스이",paldea:"팔데아",
  primal:"원시",origin:"오리진",therian:"영물",incarnate:"화신",black:"블랙",white:"화이트",attack:"어택",defense:"디펜스",
  speed:"스피드",sunny:"쾌청",rainy:"빗방울",snowy:"설백",small:"스몰",large:"라지",super:"슈퍼",average:"보통",
  female:"암컷",male:"수컷",ash:"지우",totem:"토템",eternal:"영원",crowned:"검왕/방패왕",zen:"달마",galarian:"가라르",
  complete:"퍼펙트",sword:"소드",shield:"실드",blade:"블레이드","10":"10%",low:"저",hero:"영웅",school:"군집"};
const TYPE_KO = {normal:"노말",fire:"불꽃",water:"물",electric:"전기",grass:"풀",ice:"얼음",fighting:"격투",poison:"독",
  ground:"땅",flying:"비행",psychic:"에스퍼",bug:"벌레",rock:"바위",ghost:"고스트",dragon:"드래곤",dark:"악",steel:"강철",fairy:"페어리"};
const cache = {};
const $ = id => document.getElementById(id);
const ko = (names, fb) => (names.find(n => n.language.name === "ko") || {}).name || fb;

async function get(url) {
  if (!cache[url]) cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { return await cache[url]; } catch (e) { delete cache[url]; throw e; }
}

/* ---------- 한글 이름 -> 도감 번호 ---------- */
async function koreanToId(name) {
  try {
    const r = await fetch("https://beta.pokeapi.co/graphql/v1beta", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ query: `query($n:String){ pokemonspeciesname(where:{name:{_eq:$n}, language_id:{_eq:3}}){ pokemon_species_id } }`, variables:{n:name} })
    });
    const row = (await r.json()).data.pokemonspeciesname[0];
    if (row) return row.pokemon_species_id;
  } catch {}
  return (await koMap())[name] || null;
}
let koMapPromise = null;
function koMap() {
  if (koMapPromise) return koMapPromise;
  return koMapPromise = (async () => {
    try { const c = localStorage.getItem("koMap"); if (c) return JSON.parse(c); } catch {}
    const items = (await get(`${API}/pokemon-species?limit=2000`)).results, map = {};
    for (let i = 0; i < items.length; i += 40) {
      $("msg").textContent = `한글 이름표 만드는 중... ${i}/${items.length} (처음 한 번만, 브라우저에 저장돼요)`;
      await Promise.all(items.slice(i, i + 40).map(async s => {
        try { const d = await (await fetch(s.url)).json(); const n = ko(d.names, null); if (n) map[n] = d.id; } catch {}
      }));
    }
    $("msg").textContent = "";
    try { localStorage.setItem("koMap", JSON.stringify(map)); } catch {}
    return map;
  })();
}

/* ---------- 특성 설명 (한글 우선, 없으면 영어) ---------- */
function abilityDesc(a) {
  const k = a.flavor_text_entries.filter(f => f.language.name === "ko");
  if (k.length) return k[k.length - 1].flavor_text.replace(/\s+/g, " ");
  const e = a.effect_entries.find(f => f.language.name === "en");
  if (e) return e.short_effect + " (영어)";
  return "설명 없음";
}

/* ---------- 타입 상성 (받는 데미지) ---------- */
function calcMult(types) {
  const m = {};
  Object.keys(TYPE_KO).forEach(k => m[k] = 1);
  types.forEach(t => {
    const r = t.damage_relations;
    r.double_damage_from.forEach(x => m[x.name] *= 2);
    r.half_damage_from.forEach(x => m[x.name] *= 0.5);
    r.no_damage_from.forEach(x => m[x.name] *= 0);
  });
  return m;
}
const chipOf = k => `<span class="chip" style="background:${TYPE_COLORS[k]}">${TYPE_KO[k]}</span>`;

/* ---------- 줄 요약 (많이 맞는 타입 / 많이 때리는 타입) ---------- */
function updateSummary() {
  [[0, 8, "sum1"], [8, 16, "sum2"]].forEach(([a, b, id]) => {
    const list = slots.slice(a, b).filter(x => x.types);
    const el = $(id);
    if (!list.length) { el.innerHTML = '<b>검색한 포켓몬이 없어요</b>'; return; }
    // 많이 맞는 타입: 이 줄 포켓몬 중 약점(2배 이상)인 수
    const weak = {};
    list.forEach(x => { const m = calcMult(x.types);
      Object.keys(m).forEach(k => { if (m[k] >= 2) weak[k] = (weak[k] || 0) + 1; }); });
    const weakHtml = Object.keys(weak).sort((x, y) => weak[y] - weak[x])
      .map(k => `${chipOf(k)}<span class="n">${weak[k]}마리</span>`).join("") || "없음";
    // 타점: 자속(STAB) 타입으로 굉장한 효과를 낼 수 있는 상대 타입
    const cover = {};
    list.forEach(x => {
      const hit = new Set();
      x.types.forEach(t => t.damage_relations.double_damage_to.forEach(h => hit.add(h.name)));
      hit.forEach(k => cover[k] = (cover[k] || 0) + 1);
    });
    const all = Object.keys(TYPE_KO);
    const has = all.filter(k => cover[k]).sort((a, b) => cover[b] - cover[a]);
    const none = all.filter(k => !cover[k]);
    el.innerHTML = `<div><b>많이 맞는 타입 (${list.length}마리 중 약점인 수)</b>${weakHtml}</div>
      <div><b>타점 있는 타입 (때릴 수 있는 마리 수)</b>${has.map(k => `${chipOf(k)}<span class="n">${cover[k]}마리</span>`).join("") || "없음"}</div>
      <div><b>타점 없는 타입</b>${none.map(chipOf).join("") || "없음 (모든 타입에 타점 있음)"}</div>`;
  });
}

function matchupHtml(types) {
  const m = calcMult(types);
  const rows = [["4배 약점", 4], ["2배 약점", 2], ["1/2 저항", 0.5], ["1/4 저항", 0.25], ["무효", 0]];
  const html = rows.map(([label, v]) => {
    const list = Object.keys(m).filter(k => m[k] === v);
    if (!list.length) return "";
    return `<div class="mt"><b>${label}</b>${list.map(k => `<span class="chip" style="background:${TYPE_COLORS[k]}">${TYPE_KO[k]}</span>`).join("")}</div>`;
  }).join("");
  return `<h2>타입 상성 (받는 데미지)</h2>${html || '<div class="mt">특별한 약점/저항 없음</div>'}`;
}

/* ---------- 폼 이름 ---------- */
function formLabel(speciesName, v) {
  if (v.is_default) return "기본";
  const suffix = v.pokemon.name.startsWith(speciesName + "-") ? v.pokemon.name.slice(speciesName.length + 1) : v.pokemon.name;
  return suffix.split("-").map(t => FORM_KO[t] || t).join(" ");
}

/* ---------- 슬롯 ---------- */
const slots = [];
for (let i = 0; i < N; i++) {
  const el = document.createElement("div");
  el.className = "slot";
  el.innerHTML = `<input placeholder="${i < 8 ? "A" : "B"}${i % 8 + 1} (예: 리자몽)" autocomplete="off"><div class="res"></div>`;
  (i < 8 ? $("grid1") : $("grid2")).appendChild(el);
  const input = el.querySelector("input"), res = el.querySelector(".res");
  input.addEventListener("keydown", e => { if (e.key === "Enter") run(i); });
  slots.push({ input, res, species: null, types: null });
}

async function run(i) {
  const s = slots[i], q = s.input.value.trim();
  if (!q) { s.res.innerHTML = ""; s.types = null; updateSummary(); return; }
  s.res.innerHTML = '<div class="err">불러오는 중...</div>';
  try {
    let key = q.toLowerCase().replace(/\s+/g, "-");
    if (/[가-힣]/.test(key)) {
      const id = await koreanToId(key);
      if (!id) throw new Error("not found");
      key = id;
    }
    s.species = await get(`${API}/pokemon-species/${key}`);
    const def = s.species.varieties.find(v => v.is_default) || s.species.varieties[0];
    await show(i, def.pokemon.name);
  } catch (err) {
    s.types = null; updateSummary();
    const nf = ["not found", "404"].includes(String(err.message));
    s.res.innerHTML = `<div class="err">${nf ? "찾지 못했어요. 이름/번호를 확인해 주세요."
      : "API 연결 실패. 미리보기 창이 아니라 다운로드한 파일을 브라우저로 열어 주세요. (" + err.message + ")"}</div>`;
  }
}

async function show(i, pokemonName) {
  const s = slots[i], sp = s.species;
  const p = await get(`${API}/pokemon/${pokemonName}`);
  const [types, abilities] = await Promise.all([
    Promise.all(p.types.map(t => get(t.type.url))),
    Promise.all(p.abilities.map(a => get(a.ability.url)))
  ]);
  s.types = types;
  const name = ko(sp.names, sp.name);
  const genus = (sp.genera.find(g => g.language.name === "ko") || {}).genus || "";
  const img = p.sprites.other["official-artwork"].front_default || p.sprites.front_default || "";
  const total = p.stats.reduce((a, x) => a + x.base_stat, 0);

  const formsHtml = sp.varieties.length > 1 ? `<h2>폼 (${sp.varieties.length})</h2><div class="forms">` +
    sp.varieties.map(v => `<button class="${v.pokemon.name === pokemonName ? "on" : ""}" data-f="${v.pokemon.name}">${formLabel(sp.name, v)}</button>`).join("") + "</div>" : "";

  s.res.innerHTML = `
    <div class="head">
      <img src="${img}" alt="${name}">
      <div><div class="no">No.${String(sp.id).padStart(4, "0")}</div>
      <div class="name">${name}</div>
      <div class="genus">${genus} · ${p.name}</div></div>
    </div>
    ${formsHtml}
    <h2>타입</h2>${types.map(t => `<span class="chip" style="background:${TYPE_COLORS[t.name] || "#777"}">${ko(t.names, t.name)}</span>`).join("")}
    ${matchupHtml(types)}
    <h2>특성</h2>${abilities.map((a, k) => `<div class="abrow"><span class="ab ${p.abilities[k].is_hidden ? "hidden" : ""}">${ko(a.names, a.name)}</span><div class="abdesc">${abilityDesc(a)}</div></div>`).join("")}
    <h2>종족값</h2>${p.stats.map(x => `<div class="stat"><span>${STAT_KO[x.stat.name]}</span><span>${x.base_stat}</span>
      <div class="track"><div class="fill" style="width:${Math.min(100, x.base_stat / 255 * 100)}%"></div></div></div>`).join("")}
    <div class="total">합계 ${total}</div>`;
  updateSummary();
  s.res.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => show(i, b.dataset.f).catch(() => {})));
}

$("all").addEventListener("click", () => slots.forEach((_, i) => run(i)));
$("clear").addEventListener("click", () => { slots.forEach(s => { s.input.value = ""; s.res.innerHTML = ""; s.species = null; s.types = null; }); updateSummary(); });
updateSummary();
