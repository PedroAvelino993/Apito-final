// Apito Final: carreira, loja e telas. A partida em si fica em motor.js.

const $ = (id) => document.getElementById(id);
const CHAVE = "apito-final";

// ---------- Progresso salvo ----------

const salvoPadrao = () => ({
  moedas: 0, liberada: 0, escolhida: 0,
  boas: {}, melhorias: {}, uniforme: "padrao",
  jogos: 0, perfeitas: 0, melhorNota: 0, campeao: false
});

let salvo = salvoPadrao();
try {
  const lido = JSON.parse(localStorage.getItem(CHAVE));
  if (lido) salvo = { ...salvo, ...lido };
} catch {}

function guardar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(salvo)); } catch {}
}

const tem = (id) => !!salvo.melhorias[id];
const ligaAtual = () => LIGAS[salvo.escolhida];

// ---------- Toques fantasmas ----------
// Quando um painel abre embaixo do dedo, o "clique" do mesmo toque cairia
// num botão do painel. Por um instante depois de abrir, ignoramos cliques.
let bloqueioAte = 0;
function bloquearCliques(ms = 350) {
  bloqueioAte = performance.now() + ms;
}
const bloqueado = () => performance.now() < bloqueioAte;
for (const tipo of ["click", "pointerdown", "pointerup"]) {
  document.addEventListener(tipo, (e) => {
    if (bloqueado() && e.target.closest && !e.target.closest("#b-apito")) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

// ---------- Navegação ----------

const TELAS = ["t-inicio", "t-prejogo", "t-jogo", "t-resultado", "t-loja", "t-regras"];
function irPara(id) {
  for (const t of TELAS) $(t).hidden = t !== id;
  window.scrollTo(0, 0);
}

// ---------- Início ----------

function telaInicio() {
  const liga = ligaAtual();
  const boas = salvo.boas[liga.id] || 0;
  const proxima = LIGAS[salvo.escolhida + 1];
  const ultima = salvo.escolhida === LIGAS.length - 1;
  const fracao = Math.min(1, boas / liga.precisa);
  const ferramentas = [];
  if (liga.var) ferramentas.push("📺 VAR na liga");
  for (const m of MELHORIAS) if (!m.cosmetico && tem(m.id)) ferramentas.push(`${m.icone} ${m.nome}`);

  $("carreira").innerHTML = `
    <p class="cc-rotulo">Você apita na</p>
    <p class="cc-liga" style="color:${liga.cor}">${liga.nome}</p>
    <p class="cc-sub">${liga.sub} · ${liga.var ? "com VAR" : "sem VAR"} · 🪙 ${liga.moedas} por acerto</p>
    <div class="cc-barra"><span style="width:${fracao * 100}%"></span></div>
    <p class="cc-progresso">${
      ultima
        ? (salvo.campeao ? "🏆 Você já apitou a final da Copa do Mundo!" : "Apite bem a final (nota 7+) para fechar a carreira.")
        : salvo.liberada > salvo.escolhida
          ? `Você já subiu desta liga. Próxima: ${proxima.nome}.`
          : `${boas} de ${liga.precisa} boas atuações (nota 7+) para subir para a ${proxima.nome}`
    }</p>
    <div class="cc-ferramentas">${ferramentas.map((f) => `<span>${f}</span>`).join("") || "<span>Sem equipamentos ainda — visite a loja</span>"}</div>
  `;

  $("escada").innerHTML = "";
  LIGAS.forEach((l, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    const aberta = i <= salvo.liberada;
    b.disabled = !aberta;
    b.setAttribute("aria-pressed", String(i === salvo.escolhida));
    b.innerHTML = `<span class="bola-liga" style="background:${l.cor}"></span>
      <span class="nome-liga">${l.nome}</span>
      <span class="estado-liga">${aberta ? (i < salvo.liberada ? "✔ concluída" : i === salvo.escolhida ? "atual" : "liberada") : "🔒"}</span>`;
    b.addEventListener("click", () => { salvo.escolhida = i; guardar(); telaInicio(); });
    li.appendChild(b);
    $("escada").appendChild(li);
  });

  $("moedas-inicio").textContent = `🪙 ${salvo.moedas}`;
  $("estatisticas").textContent = salvo.jogos
    ? `${salvo.jogos} partida(s) apitada(s) · melhor nota ${salvo.melhorNota.toFixed(1)} · ${salvo.perfeitas} atuação(ões) nota 10`
    : "Sua primeira partida espera por você.";
  irPara("t-inicio");
}

// ---------- Pré-jogo ----------

let confronto = null;

function telaPrejogo() {
  const liga = ligaAtual();
  const idx = [...liga.times.keys()].sort(() => Math.random() - 0.5);
  confronto = { casa: liga.times[idx[0]], fora: liga.times[idx[1]] };
  $("pre-liga").textContent = `${liga.nome} · ${liga.sub}`;
  const escudo = (t) => `<div class="escudo"><span class="camisa" style="background:${t[1]};border-color:${t[2]}"></span>${t[0]}</div>`;
  $("confronto").innerHTML = `${escudo(confronto.casa)}<span class="vs">×</span>${escudo(confronto.fora)}`;
  const info = [
    `⏱️ Partida de cerca de 4 minutos`,
    liga.var ? "📺 Esta liga tem VAR: ele pode te chamar no monitor" : "Sem VAR: decida no olho" + (tem("cabine") ? " (ou na sua cabine do VAR)" : ""),
    tem("replay") ? "🔁 Você tem replay para os lances" : "Sem replay: preste atenção ao vivo",
    `🪙 Até ${liga.moedas} moedas por decisão certa`
  ];
  $("pre-info").innerHTML = info.map((i) => `<li>${i}</li>`).join("");
  irPara("t-prejogo");
}

// ---------- Partida ----------

const canvas = $("campo");
const ctx = canvas.getContext("2d");
let P = null;
let rodando = false;
let ultimo = 0;
let cam = { cx: 0, cy: 0, larg: 46 };
let moedasPartida = 0;
let decisao = { tipo: null, cartao: null };
let modoDecisao = "normal";   // "normal" | "var"
let dpr = 1;

function larguraVista() {
  let l = ligaAtual().vistaBase;
  if (tem("fisico1")) l -= 3;
  if (tem("fisico2")) l -= 3;
  return l;
}

function redimensionar(c) {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = c.getBoundingClientRect();
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
}

function comecarPartida() {
  som.liberar();
  som.setOuro(tem("apito_ouro"));
  const liga = ligaAtual();
  moedasPartida = 0;
  P = new Partida({
    liga, casa: confronto.casa, fora: confronto.fora,
    melhorias: salvo.melhorias, aoEvento: eventoPartida
  });
  cam = { cx: 0, cy: 0, larg: larguraVista() };
  const chip = (t) => `<i style="background:${t[1]};border-color:${t[2]}"></i>${sigla(t[0])}`;
  $("h-casa").innerHTML = chip(confronto.casa);
  $("h-fora").innerHTML = chip(confronto.fora);
  $("h-liga").textContent = liga.nome;
  $("b-apito").classList.toggle("ouro", tem("apito_ouro"));
  atualizarHud();
  irPara("t-jogo");
  redimensionar(canvas);
  rodando = true;
  ultimo = performance.now();
  requestAnimationFrame(quadro);
  som.apito(1);
}

function sigla(nome) {
  const partes = nome.split(" ").filter((p) => p.length > 2);
  return (partes[0] || nome).slice(0, 3).toUpperCase();
}

function atualizarHud() {
  $("h-placar").textContent = `${P.placar[0]} × ${P.placar[1]}`;
  const m = Math.floor(P.minuto);
  $("h-relogio").textContent = m > 90 ? `90+${m - 90}'` : m > 45 && P.tempo === 1 ? `45+${m - 45}'` : `${m}'`;
  $("h-moedas").textContent = `🪙 +${moedasPartida}`;
}

function quadro(agora) {
  if (!rodando) return;
  const dt = Math.min(0.05, (agora - ultimo) / 1000);
  ultimo = agora;
  P.passo(dt);
  moverCamera(dt);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  desenharCena(ctx, W, H, cam, P, cenaAoVivo(P), {
    corArbitro: corUniforme(), festa: P.estado === "gol"
  });
  atualizarHud();
  requestAnimationFrame(quadro);
}

function corUniforme() {
  return { padrao: "#facc15", rosa: "#f472b6", verde: "#a3e635" }[salvo.uniforme] || "#facc15";
}

function moverCamera(dt) {
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const b = P.bola;
  const k = 1 - Math.exp(-3 * dt);
  const alvoX = b.x * 0.75, alvoY = b.y + 4;
  cam.cx += (alvoX - cam.cx) * k;
  cam.cy += (alvoY - cam.cy) * k;
  const meiaW = cam.larg / 2, meiaH = (cam.larg * H / W) / 2;
  cam.cx = limitar(cam.cx, -CX - 7 + meiaW, CX + 7 - meiaW);
  cam.cy = meiaH < CY + 10 ? limitar(cam.cy, -CY - 10 + meiaH, CY + 10 - meiaH) : 0;
}

// Eventos que a partida manda para a tela
function eventoPartida(tipo, dados) {
  if (tipo === "decisao") abrirDecisao("normal");
  if (tipo === "gol") abrirGol(dados);
  if (tipo === "cartao") mostrarCartao(dados);
  if (tipo === "aviso") aviso(dados);
  if (tipo === "intervalo") aviso("Intervalo ⏸");
  if (tipo === "placar") atualizarHud();
  if (tipo === "feedback") toast(dados);
  if (tipo === "naoApitado") aposNaoApitar(dados);
  if (tipo === "fim") setTimeout(() => fimDePartida(dados), 1600);
}

// ---------- Avisos ----------

let avisoTimer = null;
function aviso(texto) {
  const el = $("aviso");
  el.textContent = texto;
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), 1400);
}

let toastTimer = null;
function toast({ titulo, texto, pontos, max, moedas }) {
  const el = $("toast");
  const classe = pontos === undefined ? "erro" : pontos === max ? "" : pontos > 0 ? "meio" : "erro";
  el.className = "toast " + classe;
  el.innerHTML = `${moedas ? `<span class="t-moedas">+${moedas} 🪙</span>` : ""}<b></b><p></p>`;
  el.querySelector("b").textContent = titulo;
  el.querySelector("p").textContent = texto;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3400);
  if (moedas) som.moeda();
}

function pagar(item) {
  const moedas = Math.round((item.pontos / item.max) * ligaAtual().moedas);
  moedasPartida += moedas;
  return moedas;
}

// ---------- Apito ----------

function apitar() {
  if (!P || P.estado !== "jogo") return;
  const b = $("b-apito");
  b.classList.add("batendo");
  setTimeout(() => b.classList.remove("batendo"), 120);
  P.apitar();
}

// ---------- Decisão de lance ----------

function abrirDecisao(modo) {
  bloquearCliques();
  modoDecisao = modo;
  decisao = { tipo: null, cartao: null };
  $("dec-tag").textContent = modo === "var" ? "📺 Revisão no monitor do VAR" : "Você parou o jogo";
  marcarOpcoes();
  const L = P.lance || P.lanceAnterior;
  const pode = modo === "var" || podeReplay(L && L.area);
  $("dec-replay").hidden = !pode;
  $("dec-replay").textContent = liga().var || tem("cabine") ? (tem("replay") ? "📺 Ver replay" : "📺 Ir ao monitor") : "📺 Ver replay";
  $("m-decisao").hidden = false;
}

const liga = () => ligaAtual();

function podeReplay(chave) {
  return tem("replay") || ((liga().var || tem("cabine")) && chave);
}

function marcarOpcoes() {
  for (const b of $("dec-tipo").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === decisao.tipo));
  for (const b of $("dec-cartao").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === decisao.cartao));
  $("dec-bloco-cartao").hidden = decisao.tipo === "nada";
  const pronto = decisao.tipo && (decisao.tipo === "nada" || decisao.cartao);
  $("dec-confirmar").disabled = !pronto;
}

$("dec-tipo").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  decisao.tipo = b.dataset.v;
  if (decisao.tipo === "nada") decisao.cartao = "nenhum";
  marcarOpcoes();
});
$("dec-cartao").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  decisao.cartao = b.dataset.v;
  marcarOpcoes();
});

$("dec-confirmar").addEventListener("click", () => {
  $("m-decisao").hidden = true;
  const d = { apitou: true, tipo: decisao.tipo, cartao: decisao.cartao || "nenhum" };
  if (modoDecisao === "var") {
    const item = P.reavaliar(d);
    toast({ ...item, moedas: pagar(item) });
    P.aplicarDecisao(d);
    return;
  }
  const item = P.resolverLance(d);
  // Nas ligas com VAR, um erro em lance importante pode ser revisto
  if (item.pontos < 3 && deveChamarVar(item)) {
    P.estado = "pausado";
    setTimeout(() => chamarVar("lance"), 500);
    return;
  }
  toast({ ...item, moedas: pagar(item) });
  P.aplicarDecisao(d);
});

function deveChamarVar(item) {
  if (!liga().var || !item.chave) return false;
  const chance = 0.6 + (tem("equipevar") ? 0.3 : 0);
  return Math.random() < chance;
}

// Lance que passou sem apito
function aposNaoApitar(item) {
  if (item.pontos < 3 && deveChamarVar(item)) {
    P.estado = "pausado";
    chamarVar("lance");
    return;
  }
  toast({ ...item, moedas: pagar(item) });
}

let varQual = "lance";
function chamarVar(qual) {
  bloquearCliques();
  varQual = qual;
  som.apito(1);
  $("m-var").hidden = false;
}

$("var-ir").addEventListener("click", () => {
  $("m-var").hidden = true;
  if (varQual === "gol") {
    abrirReplay("gol", () => abrirGol(P.golPendente, "var"));
  } else {
    abrirReplay("lance", () => abrirDecisao("var"));
  }
});

$("dec-replay").addEventListener("click", () => {
  $("m-decisao").hidden = true;
  abrirReplay("lance", () => ($("m-decisao").hidden = false));
});

// ---------- Gol ----------

let modoGol = "normal";
function abrirGol(G, modo = "normal") {
  bloquearCliques();
  modoGol = modo;
  const time = P.times[G.time][0];
  $("gol-titulo").textContent = modo === "var" ? `Revisão do gol do ${time}` : `Gol do ${time}! Vale?`;
  // Bandeirinha
  const bandeira = $("gol-bandeira");
  if (tem("bandeira") && modo === "normal") {
    const levantou = G.verdade === "impedimento" ? Math.random() < 0.88 : Math.random() < 0.06;
    bandeira.textContent = levantou ? "🚩 O bandeirinha levantou a bandeira: impedimento!" : "🟢 O bandeirinha não marcou impedimento.";
    bandeira.hidden = false;
  } else {
    bandeira.hidden = true;
  }
  $("gol-replay").hidden = !(modo === "var" || podeReplay(true));
  $("gol-replay").textContent = tem("replay") ? "📺 Ver replay" : "📺 Ir ao monitor";
  $("m-gol").hidden = false;
}

$("gol-opcoes").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const escolha = b.dataset.v;
  $("m-gol").hidden = true;
  if (modoGol === "var") {
    P.registro.pop();
    const item = P.decidirGol(escolha);
    if (item.pontos === 3) { item.pontos = 2; item.titulo = "Corrigido no VAR 📺"; }
    toast({ ...item, moedas: pagar(item) });
    P.aplicarGol(escolha);
    return;
  }
  const item = P.decidirGol(escolha);
  if (item.pontos < 3 && deveChamarVar(item)) {
    setTimeout(() => chamarVar("gol"), 400);
    return;
  }
  toast({ ...item, moedas: pagar(item) });
  if (escolha !== "legal") aviso("Gol anulado ❌");
  else aviso("⚽ GOL!");
  P.aplicarGol(escolha);
});

$("gol-replay").addEventListener("click", () => {
  $("m-gol").hidden = true;
  abrirReplay("gol", () => ($("m-gol").hidden = false));
});

// ---------- Cartão ----------

function mostrarCartao({ jogador, cor, time }) {
  const el = $("cartao-show");
  const fis = $("cartao-fisico");
  fis.className = "cartao-fisico " + (cor === "amarelo" ? "amarelo" : "vermelho");
  const textos = {
    amarelo: `Amarelo para o camisa ${jogador.num} (${time})`,
    vermelho: `Vermelho! Camisa ${jogador.num} (${time}) expulso`,
    segundo: `Segundo amarelo! Camisa ${jogador.num} (${time}) expulso`
  };
  $("cartao-texto").textContent = textos[cor];
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 1700);
}

// ---------- Replay ----------

const rpCanvas = $("rp-canvas");
const rpCtx = rpCanvas.getContext("2d");
let rp = null;

let rpId = 0;   // evita dois laços de desenho ao reabrir o replay

function abrirReplay(qual, aoFechar) {
  const dados = P.replay(qual);
  if (!dados || dados.frames.length < 2) {
    toast({ titulo: "Replay indisponível", texto: "Não deu para gravar esse lance.", pontos: 0, max: 3 });
    aoFechar();
    return;
  }
  rp = {
    ...dados, qual, aoFechar,
    ini: dados.frames[0].t, fim: dados.frames[dados.frames.length - 1].t,
    t: dados.frames[0].t, tocando: true, arrastando: false,
    lento: tem("lenta"), zoom: tem("zoom"),
    cam: { cx: dados.foco ? dados.foco.x : dados.frames[0].b[0], cy: dados.foco ? dados.foco.y : dados.frames[0].b[1], larg: larguraVista() },
    ultimo: performance.now(), id: ++rpId
  };
  bloquearCliques();
  $("m-replay").hidden = false;
  redimensionar(rpCanvas);
  $("rp-lento").disabled = !tem("lenta");
  $("rp-zoom").disabled = !tem("zoom");
  $("rp-passe").hidden = !(qual === "gol" && dados.passe && tem("linhas"));
  $("rp-info").textContent = qual === "gol" ? "Gol: do passe até a bola entrar" : "Lance: antes e depois do contato";
  $("rp-total").textContent = segundos(rp.fim - rp.ini);
  const pos = rp.momento ? (rp.momento - rp.ini) / (rp.fim - rp.ini) : -1;
  $("rp-momento").hidden = !(pos >= 0 && pos <= 1);
  $("rp-momento").style.left = `${pos * 100}%`;
  const dicas = [];
  if (!tem("lenta")) dicas.push("🐢 Câmera lenta");
  if (!tem("zoom")) dicas.push("🔍 Ângulo aproximado");
  if (!tem("tatica")) dicas.push("🎯 Câmera tática");
  if (qual === "gol" && !tem("linhas")) dicas.push("📏 Linhas de impedimento");
  $("rp-dica").textContent = dicas.length
    ? `Marca laranja = momento do ${qual === "gol" ? "passe" : "contato"} · Na loja: ${dicas.join(", ")}`
    : `Marca laranja = momento do ${qual === "gol" ? "passe" : "contato"}. Toque na imagem para pausar.`;
  marcarRp();
  const id = rp.id;
  requestAnimationFrame((t) => quadroReplay(t, id));
}

const segundos = (s) => `${Math.max(0, s).toFixed(1).replace(".", ",")}s`;

function marcarRp() {
  $("rp-play").textContent = rp.tocando ? "❚❚ Pausar" : "▶ Play";
  $("rp-lento").setAttribute("aria-pressed", String(rp.lento));
  $("rp-zoom").setAttribute("aria-pressed", String(rp.zoom));
}

function quadroAt(t) {
  const fr = rp.frames;
  let i = fr.findIndex((f) => f.t >= t);
  if (i < 0) i = fr.length - 1;
  return fr[i];
}

function irPara_t(t) {
  rp.t = limitar(t, rp.ini, rp.fim);
}

function quadroReplay(agora, id) {
  if (!rp || rp.id !== id || $("m-replay").hidden) return;
  const dt = Math.min(0.05, (agora - rp.ultimo) / 1000);
  rp.ultimo = agora;
  if (rp.tocando && !rp.arrastando) {
    rp.t += dt * (rp.lento ? 0.33 : 1);
    if (rp.t > rp.fim) rp.t = rp.ini;   // repete
  }
  try {
    desenharReplay(dt);
  } catch (erro) {
    console.error(erro);   // um quadro com problema não pode travar o replay
  }
  requestAnimationFrame((t) => quadroReplay(t, id));
}

function desenharReplay(dt) {
  const fracao = (rp.t - rp.ini) / (rp.fim - rp.ini || 1);
  $("rp-cheio").style.width = `${fracao * 100}%`;
  $("rp-bolinha").style.left = `${fracao * 100}%`;
  $("rp-tempo").textContent = segundos(rp.t - rp.ini);

  const f = quadroAt(rp.t);
  // Câmera do replay
  const larg = rp.zoom ? 13 : larguraVista();
  rp.cam.larg += (larg - rp.cam.larg) * Math.min(1, dt * 6);
  // A câmera acompanha o atacante do lance (ou a bola, no replay de gol)
  const foco = rp.seguir !== null ? { x: f.j[rp.seguir][0], y: f.j[rp.seguir][1] } : { x: f.b[0], y: f.b[1] };
  rp.cam.cx += (foco.x - rp.cam.cx) * Math.min(1, dt * 4);
  rp.cam.cy += (foco.y - rp.cam.cy) * Math.min(1, dt * 4);

  const W = rpCanvas.width / dpr, H = rpCanvas.height / dpr;
  rpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const extras = { replay: true, corArbitro: corUniforme(), semNumero: false };
  if (tem("tatica")) extras.marcas = rp.marcas.filter((m) => m.t <= rp.t + 0.02);
  if (rp.passe && tem("linhas") && Math.abs(rp.t - rp.passe.t) < 0.5) {
    extras.linhas = [
      { y: rp.passe.linhaY, cor: "#ef4444" },
      { y: rp.passe.recY, cor: "#38bdf8" }
    ];
  }
  desenharCena(rpCtx, W, H, rp.cam, P, cenaGravada(P, f), extras);
  rpCtx.fillStyle = "rgba(29,78,216,0.85)";
  rpCtx.fillRect(0, 0, W, 4);
  rpCtx.textAlign = "left";
  if (rp.lento) {
    rpCtx.font = "800 13px system-ui"; rpCtx.fillStyle = "#bae6fd";
    rpCtx.fillText("CÂMERA LENTA", 12, H - 14);
  }
  if (!rp.tocando) {
    // Ícone de pausa no meio, como num vídeo
    rpCtx.fillStyle = "rgba(0,0,0,0.45)";
    rpCtx.beginPath(); rpCtx.arc(W / 2, H / 2, 34, 0, Math.PI * 2); rpCtx.fill();
    rpCtx.fillStyle = "#ffffff";
    rpCtx.beginPath(); rpCtx.moveTo(W / 2 - 10, H / 2 - 16); rpCtx.lineTo(W / 2 + 16, H / 2); rpCtx.lineTo(W / 2 - 10, H / 2 + 16); rpCtx.closePath(); rpCtx.fill();
  }
  if (extras.linhas) {
    rpCtx.font = "700 12px system-ui"; rpCtx.textAlign = "right";
    rpCtx.fillStyle = "#fca5a5"; rpCtx.fillText("— penúltimo defensor", W - 12, H - 30);
    rpCtx.fillStyle = "#7dd3fc"; rpCtx.fillText("— atacante que recebe", W - 12, H - 14);
  }
}

// Barra de tempo: arraste o dedo em qualquer ponto (como num vídeo)
const trilho = $("rp-trilho");
let tocavaAntes = true;
function posicaoNoTrilho(e) {
  const r = trilho.getBoundingClientRect();
  const fr = limitar((e.clientX - r.left) / r.width, 0, 1);
  irPara_t(rp.ini + fr * (rp.fim - rp.ini));
}
trilho.addEventListener("pointerdown", (e) => {
  if (!rp) return;
  e.preventDefault();
  trilho.setPointerCapture(e.pointerId);
  tocavaAntes = rp.tocando;
  rp.arrastando = true;
  trilho.classList.add("arrastando");
  posicaoNoTrilho(e);
});
trilho.addEventListener("pointermove", (e) => {
  if (rp && rp.arrastando) posicaoNoTrilho(e);
});
const soltarTrilho = () => {
  if (!rp || !rp.arrastando) return;
  rp.arrastando = false;
  rp.tocando = tocavaAntes;
  trilho.classList.remove("arrastando");
  marcarRp();
};
trilho.addEventListener("pointerup", soltarTrilho);
trilho.addEventListener("pointercancel", soltarTrilho);
trilho.addEventListener("keydown", (e) => {
  if (!rp) return;
  if (e.key === "ArrowLeft") irPara_t(rp.t - 0.2);
  if (e.key === "ArrowRight") irPara_t(rp.t + 0.2);
});

// Tocar na imagem pausa ou continua
rpCanvas.addEventListener("click", () => {
  if (!rp) return;
  rp.tocando = !rp.tocando;
  marcarRp();
});

$("rp-play").addEventListener("click", () => {
  if (!rp) return;
  if (!rp.tocando && rp.t >= rp.fim - 0.01) rp.t = rp.ini;
  rp.tocando = !rp.tocando;
  marcarRp();
});
$("rp-voltar1").addEventListener("click", () => { if (rp) irPara_t(rp.t - 1); });
$("rp-avancar1").addEventListener("click", () => { if (rp) irPara_t(rp.t + 1); });
$("rp-inicio").addEventListener("click", () => { if (!rp) return; rp.t = rp.ini; rp.tocando = true; marcarRp(); });
$("rp-lento").addEventListener("click", () => { if (!rp) return; rp.lento = !rp.lento; marcarRp(); });
$("rp-zoom").addEventListener("click", () => { if (!rp) return; rp.zoom = !rp.zoom; marcarRp(); });
$("rp-passe").addEventListener("click", () => { if (!rp) return; rp.t = rp.passe.t; rp.tocando = false; marcarRp(); });
$("rp-fechar").addEventListener("click", () => {
  bloquearCliques();
  $("m-replay").hidden = true;
  const fn = rp.aoFechar;
  rp = null;
  fn();
});

// ---------- Fim de partida ----------

function fimDePartida(res) {
  rodando = false;
  const liga = ligaAtual();
  const nota = res.nota;
  let bonus = 0;
  if (nota >= 8) bonus = liga.moedas * 2;
  if (nota >= 10) bonus = liga.moedas * 4;
  const total = moedasPartida + bonus;
  salvo.moedas += total;
  salvo.jogos++;
  salvo.melhorNota = Math.max(salvo.melhorNota, nota);
  if (nota >= 10) salvo.perfeitas++;

  let progressoTxt = "";
  if (nota >= 7) {
    salvo.boas[liga.id] = (salvo.boas[liga.id] || 0) + 1;
    const ultima = salvo.escolhida === LIGAS.length - 1;
    if (ultima) {
      salvo.campeao = true;
      progressoTxt = "🏆 <b>Você apitou a final da Copa do Mundo!</b> Você chegou ao topo da arbitragem.";
    } else if (salvo.boas[liga.id] >= liga.precisa && salvo.liberada === salvo.escolhida) {
      salvo.liberada++;
      salvo.escolhida = salvo.liberada;
      progressoTxt = `🎉 <b>Promovido!</b> Agora você apita na <b>${LIGAS[salvo.liberada].nome}</b>.`;
    } else if (salvo.liberada === salvo.escolhida) {
      progressoTxt = `Boa atuação! <b>${salvo.boas[liga.id]} de ${liga.precisa}</b> para subir de liga.`;
    } else {
      progressoTxt = "Boa atuação!";
    }
  } else {
    progressoTxt = "Nota abaixo de 7 não conta para subir de liga. Tente de novo!";
  }
  guardar();

  $("res-liga").textContent = `${liga.nome} · fim de jogo`;
  $("res-nota").textContent = nota.toFixed(1);
  $("res-nota").style.color = nota >= 8 ? "#86efac" : nota >= 6 ? "#fde047" : "#fca5a5";
  $("res-frase").textContent = nota >= 9.5 ? "Atuação perfeita! A imprensa elogiou." : nota >= 8 ? "Ótima arbitragem!" : nota >= 7 ? "Boa arbitragem." : nota >= 5 ? "Arbitragem irregular." : "A torcida não ficou nada feliz...";
  $("res-placar").textContent = `${confronto.casa[0]} ${res.placar[0]} × ${res.placar[1]} ${confronto.fora[0]}`;
  $("res-lista").innerHTML = "";
  for (const r of res.registro) {
    const li = document.createElement("li");
    li.className = r.pontos === r.max ? "" : r.pontos > 0 ? "meio" : "erro";
    li.innerHTML = "<b></b><span></span>";
    li.querySelector("b").textContent = `${r.pontos === r.max ? "✅" : r.pontos > 0 ? "🟡" : "❌"} ${r.titulo || r.msg}`;
    li.querySelector("span").textContent = r.texto || "";
    $("res-lista").appendChild(li);
  }
  if (!res.registro.length) $("res-lista").innerHTML = "<li>Nenhum lance para decidir.</li>";
  $("res-moedas").textContent = `+${total} 🪙${bonus ? ` (bônus de ${bonus} pela nota)` : ""}`;
  $("res-progresso").innerHTML = progressoTxt;
  irPara("t-resultado");
}

// ---------- Loja ----------

function telaLoja() {
  $("moedas-loja").textContent = `🪙 ${salvo.moedas}`;
  const montar = (lista, alvo) => {
    alvo.innerHTML = "";
    for (const m of lista) {
      const div = document.createElement("div");
      div.className = "item-loja";
      const falta = m.requer && !tem(m.requer);
      const comprado = tem(m.id);
      div.innerHTML = `<span class="ic">${m.icone}</span><div><h4></h4><p></p></div><button></button>`;
      div.querySelector("h4").textContent = m.nome;
      div.querySelector("p").textContent = falta ? `${m.desc} (precisa de: ${MELHORIAS.find((x) => x.id === m.requer).nome})` : m.desc;
      const b = div.querySelector("button");
      const uniforme = m.id.startsWith("uniforme_") ? m.id.replace("uniforme_", "") : null;
      if (comprado && uniforme) {
        const usando = salvo.uniforme === uniforme;
        b.textContent = usando ? "Usando" : "Usar";
        b.className = usando ? "tem" : "";
        b.addEventListener("click", () => { salvo.uniforme = usando ? "padrao" : uniforme; guardar(); telaLoja(); });
      } else if (comprado) {
        b.textContent = "✔ Comprado";
        b.className = "tem";
        b.disabled = true;
      } else {
        b.textContent = `🪙 ${m.preco}`;
        b.disabled = falta || salvo.moedas < m.preco;
        b.addEventListener("click", () => {
          if (salvo.moedas < m.preco) return;
          salvo.moedas -= m.preco;
          salvo.melhorias[m.id] = true;
          if (uniforme) salvo.uniforme = uniforme;
          guardar();
          som.liberar(); som.moeda();
          telaLoja();
        });
      }
      alvo.appendChild(div);
    }
  };
  montar(MELHORIAS.filter((m) => !m.cosmetico), $("loja-equip"));
  montar(MELHORIAS.filter((m) => m.cosmetico), $("loja-visual"));
  irPara("t-loja");
}

// ---------- Pausa ----------

let estadoAntesPausa = null;
$("b-pausa").addEventListener("click", () => {
  if (!P || P.estado === "decisao" || P.estado === "gol") return;
  estadoAntesPausa = P.estado;
  P.estado = "pausado";
  $("m-pausa").hidden = false;
});
$("pausa-voltar").addEventListener("click", () => {
  $("m-pausa").hidden = true;
  if (P && P.estado === "pausado") P.estado = estadoAntesPausa || "jogo";
});
$("pausa-sair").addEventListener("click", () => {
  $("m-pausa").hidden = true;
  rodando = false;
  P = null;
  telaInicio();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && P && rodando && P.estado === "jogo") $("b-pausa").click();
});

// ---------- Botões gerais ----------

$("b-apito").addEventListener("pointerdown", (e) => { e.preventDefault(); apitar(); });
// No iPhone, cancelar o toque evita o clique fantasma depois do apito
$("b-apito").addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !$("t-jogo").hidden) { e.preventDefault(); apitar(); }
});
$("b-jogar").addEventListener("click", telaPrejogo);
$("b-entrar").addEventListener("click", comecarPartida);
$("b-voltar-pre").addEventListener("click", telaInicio);
$("b-loja").addEventListener("click", telaLoja);
$("b-loja-voltar").addEventListener("click", telaInicio);
$("b-regras").addEventListener("click", () => irPara("t-regras"));
$("b-regras-voltar").addEventListener("click", telaInicio);
$("b-res-ok").addEventListener("click", telaInicio);
window.addEventListener("resize", () => {
  if (!$("t-jogo").hidden) redimensionar(canvas);
  if (!$("m-replay").hidden) redimensionar(rpCanvas);
});

telaInicio();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js");
}
