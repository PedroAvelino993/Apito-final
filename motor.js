// Motor da partida: simulação dos jogadores e da bola, lances para apitar,
// gravação para o replay e desenho do campo (visto de cima).
// Medidas em metros. O campo fica "em pé" na tela: o time da casa ataca para cima.

const CX = 34, CY = 52.5;            // metade da largura e do comprimento
const AREA_X = 20.16, AREA_Y = 16.5;  // grande área
const PEQ_X = 9.16, PEQ_Y = 5.5;      // pequena área
const GOL_X = 3.66;
const PASSO = 1 / 60;
const SEG_POR_MINUTO = 2.6;           // 90 minutos ≈ 4 minutos de verdade
const GRAVAR_SEG = 12;

const FORMACAO = [
  ["gol", 0, 0.02],
  ["zag", -0.78, 0.2], ["zag", -0.27, 0.16], ["zag", 0.27, 0.16], ["zag", 0.78, 0.2],
  ["mei", -0.72, 0.42], ["mei", -0.22, 0.38], ["mei", 0.22, 0.38], ["mei", 0.72, 0.42],
  ["ata", -0.24, 0.62], ["ata", 0.24, 0.64]
];
const NUMEROS = [1, 2, 3, 4, 6, 7, 5, 8, 11, 9, 10];
const PELES = ["#f1c9a5", "#d9a074", "#a8704a", "#7a4a2c", "#5a3520"];
const CABELOS = ["#2b1d14", "#120c08", "#6b4423", "#c9a15b", "#1a1a1a"];

const aleat = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dirDe = (time) => (time === 0 ? -1 : 1);   // sentido do ataque em y

function sortearPeso(pesos) {
  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, p] of Object.entries(pesos)) {
    r -= p;
    if (r <= 0) return k;
  }
  return Object.keys(pesos)[0];
}

class Partida {
  constructor({ liga, casa, fora, melhorias, aoEvento }) {
    this.liga = liga;
    this.times = [casa, fora];
    this.melhorias = melhorias;
    this.aoEvento = aoEvento || (() => {});
    this.placar = [0, 0];
    this.relogio = 0;           // segundos de jogo rodando
    this.minuto = 0;
    this.tempo = 1;             // 1º ou 2º tempo
    this.acrescimo = Math.floor(aleat(1, 4));
    this.estado = "parado";
    this.espera = 1.5;
    this.acumulado = 0;
    this.posse = 0;
    this.lance = null;
    this.forcarArea = null;
    this.ultimoPasse = null;
    this.frames = [];
    this.marcas = [];
    this.passes = [];
    this.registro = [];         // decisões do árbitro para a nota final
    this.particulas = [];
    this.flash = 0;

    // 1 ou 2 gols "no detalhe" por partida (impedimento por pouco ou legal por pouco)
    this.golsDuvidosos = Array.from({ length: Math.random() < 0.5 ? 1 : 2 }, () => ({
      minuto: aleat(12, 82), plano: Math.random() < 0.5 ? "impedimento" : "legal"
    })).sort((a, b) => a.minuto - b.minuto);
    const n = liga.incidentes;
    this.agenda = Array.from({ length: n }, (_, i) => 4 + (i + aleat(0.15, 0.85)) * (84 / n));

    this.jogadores = [];
    for (let t = 0; t < 2; t++) {
      FORMACAO.forEach(([papel, fx, fy], i) => {
        this.jogadores.push({
          time: t, papel, fx, fy, num: NUMEROS[i],
          x: 0, y: 0, vx: 0, vy: 0, ang: t === 0 ? -Math.PI / 2 : Math.PI / 2,
          fase: Math.random() * 6, caido: 0, quedaAng: 0, expulso: false, saiu: false,
          amarelos: 0, semente: Math.random() * 100, lunge: 0, braco: 0,
          pele: PELES[Math.floor(Math.random() * PELES.length)],
          cabelo: CABELOS[Math.floor(Math.random() * CABELOS.length)],
          graca: 0, alvoX: 0, alvoY: 0, decidir: 1.5
        });
      });
    }
    this.arbitro = { x: 6, y: 0, vx: 0, vy: 0, ang: 0, fase: 0 };
    this.bola = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dono: null, alvo: null, giro: 0, chute: null, toque: null };
    this.torcida = gerarTorcida();
    this.saidaDeBola(0);
  }

  // ---------- Utilidades ----------

  doTime(t) { return this.jogadores.filter((j) => j.time === t && !j.expulso); }
  goleiro(t) { return this.jogadores.find((j) => j.time === t && j.papel === "gol"); }
  naArea(x, y, timeAtacante) {
    const d = dirDe(timeAtacante);
    return Math.abs(x) <= AREA_X && d * y >= CY - AREA_Y && d * y <= CY;
  }
  livre(j) { return !j.expulso && j.caido <= 0; }

  // Linha de impedimento: o penúltimo adversário (contando o goleiro)
  linhaDefesa(timeAtacante) {
    const d = dirDe(timeAtacante);
    const defs = this.doTime(1 - timeAtacante).map((j) => j.y).sort((a, b) => d * b - d * a);
    return defs[1] ?? d * CY;
  }

  calcularImpedimento(rec) {
    const d = dirDe(rec.time);
    const linha = this.linhaDefesa(rec.time);
    const adiante = Math.max(d * linha, d * this.bola.y, 0);
    return { impedido: d * rec.y > adiante + 0.05, linhaY: linha, recY: rec.y };
  }

  // ---------- Reinícios ----------

  posicoesIniciais() {
    for (const j of this.jogadores) {
      if (j.expulso) continue;
      const d = dirDe(j.time);
      const fy = Math.min(j.fy, 0.48);
      j.x = j.fx * CX * 0.78;
      j.y = -d * CY + d * fy * 2 * CY * 0.98;
      if (j.papel === "ata") j.y = -d * aleat(1.5, 9);
      j.vx = j.vy = 0;
      j.caido = 0;
    }
  }

  saidaDeBola(time) {
    this.posicoesIniciais();
    const b = this.bola;
    Object.assign(b, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, alvo: null, chute: null });
    const ata = this.doTime(time).filter((j) => j.papel === "ata");
    const c = ata[0] || this.doTime(time)[5];
    c.x = 0.6; c.y = -dirDe(time) * 0.5;
    this.darBola(c);
    this.estado = "parado";
    this.espera = 1.6;
    this.arbitro.x = 8; this.arbitro.y = 4;
  }

  darBola(j) {
    const b = this.bola;
    b.dono = j;
    b.alvo = null;
    b.chute = null;
    b.toque = j;
    b.vx = b.vy = b.vz = 0;
    b.z = 0;
    this.posse = j.time;
    j.graca = 0.8;
    j.decidir = aleat(1.0, 2.4);
    if (b.maoPlano === j) {
      b.maoPlano = null;
      b.maoDe = j;
      j.braco = 0.6;
      this.marcas.push({ t: this.relogio, x: j.x, y: j.y, tipo: "mao" });
    }
  }

  reinicio(j, espera = 1.2) {
    this.darBola(j);
    this.estado = "parado";
    this.espera = espera;
  }

  // ---------- Laço da simulação ----------

  passo(dtReal) {
    this.acumulado += Math.min(dtReal, 0.1);
    while (this.acumulado >= PASSO) {
      this.acumulado -= PASSO;
      this.atualizar(PASSO);
    }
  }

  atualizar(dt) {
    if (this.flash > 0) this.flash -= dt;
    this.atualizarParticulas(dt);
    if (this.estado === "decisao" || this.estado === "gol" || this.estado === "fim" || this.estado === "pausado") return;

    if (this.estado === "intervalo") {
      this.espera -= dt;
      if (this.espera <= 0) { this.tempo = 2; this.saidaDeBola(1); }
      return;
    }

    if (this.estado === "parado") {
      this.espera -= dt;
      this.moverTodos(dt, true);
      this.gravar(dt);
      if (this.espera <= 0) this.estado = "jogo";
      return;
    }

    if (this.estado === "penalti") {
      this.atualizarPenalti(dt);
      this.moverTodos(dt, true);
      this.atualizarBola(dt);
      this.gravar(dt);
      return;
    }

    // Relógio da partida
    this.relogio += dt;
    this.minuto += dt / SEG_POR_MINUTO;
    if (this.tempo === 1 && this.minuto >= 45 && !this.lance) {
      this.minuto = 45;
      this.estado = "intervalo";
      this.espera = 2.5;
      this.aoEvento("intervalo");
      som.apito(2);
      return;
    }
    if (this.tempo === 2 && this.minuto >= 90 + this.acrescimo && !this.lance) {
      this.estado = "fim";
      som.apito(3);
      this.aoEvento("fim", this.resumo());
      return;
    }

    this.agendarLances();
    this.ia(dt);
    this.atualizarLance(dt);
    this.moverTodos(dt, false);
    this.atualizarBola(dt);
    this.gravar(dt);
  }

  // ---------- Inteligência dos jogadores ----------

  ia(dt) {
    const b = this.bola;
    const c = b.dono;
    const linhas = [this.linhaDefesa(0), this.linhaDefesa(1)];

    for (const j of this.jogadores) {
      if (!this.livre(j)) continue;
      if (j.graca > 0) j.graca -= dt;
      if (this.lance && (j === this.lance.D || (j === this.lance.A && !this.lance.tc))) continue;
      const d = dirDe(j.time);
      const atacando = this.posse === j.time;

      if (j.papel === "gol") {
        j.alvoX = limitar(b.x * 0.15, -2.8, 2.8);
        j.alvoY = -d * (CY - 1.2);
        // Chute vindo: o goleiro pula para onde a bola vai (ou para o lado errado)
        if (b.chute && b.chute.de.time !== j.time && b.vy !== 0) {
          const tempo = (-d * CY - b.y) / b.vy;
          const cruza = b.x + b.vx * Math.max(0, tempo);
          j.alvoX = limitar(b.chute.defende ? cruza : -cruza * 0.8 + Math.sign(-cruza || 1), -3.6, 3.6);
          j.alvoY = -d * (CY - 0.8);
          j.mergulho = true;
        } else {
          j.mergulho = false;
        }
        continue;
      }

      // Posição de formação: o time anda como um bloco em volta da bola
      const centro = b.y * 0.7 + (atacando ? d * 5 : -d * 6);
      let y = centro + d * (j.fy - 0.4) * 2 * CY * 0.5;
      // Ninguém (fora o goleiro) fica grudado na própria linha de gol
      if (d * y < -CY + 7) y = d * (-CY + 7);
      let x = j.fx * CX * 0.8 + b.x * 0.3;
      if (j.papel === "ata" && atacando) {
        // Atacantes ficam rondando a linha do impedimento
        // (+2 compensa o atraso de quem corre atrás de um alvo que anda)
        const oscila = Math.sin(this.relogio * 0.45 + j.semente) * 2.3 + 0.9;
        y = linhas[j.time] + d * oscila;
      }
      j.alvoX = limitar(x, -CX + 1.5, CX - 1.5);
      j.alvoY = limitar(y, -CY + 2, CY - 2);
    }

    if (c && this.livre(c)) {
      this.iaPortador(c, dt);
      this.iaMarcacao(c, dt);
    } else if (!c && !b.chute) {
      // Bola solta: o mais perto de cada time corre atrás dela
      for (let t = 0; t < 2; t++) {
        const perto = this.maisPerto(this.doTime(t).filter((j) => this.livre(j) && j.papel !== "gol"), b);
        if (perto && !(this.lance && perto === this.lance.D && !this.lance.tc)) {
          const alvo = b.alvo === perto ? { x: b.x + b.vx * 0.35, y: b.y + b.vy * 0.35 } : b;
          perto.alvoX = alvo.x; perto.alvoY = alvo.y;
        }
      }
      if (b.alvo && this.livre(b.alvo)) {
        b.alvo.alvoX = b.x + b.vx * 0.45;
        b.alvo.alvoY = b.y + b.vy * 0.45;
      }
    }
  }

  maisPerto(lista, p) {
    let melhor = null, md = Infinity;
    for (const j of lista) {
      const dd = dist(j, p);
      if (dd < md) { md = dd; melhor = j; }
    }
    return melhor;
  }

  iaPortador(c, dt) {
    const d = dirDe(c.time);
    const forcar = this.forcarArea && this.forcarArea.time === c.time;
    if (c.papel === "gol") {
      c.decidir -= dt;
      if (c.decidir <= 0) this.passar(c, true);
      return;
    }
    let ty = c.y + d * 12;
    let tx = c.x * 0.85 + Math.sin(this.relogio * 0.8 + c.semente) * 7;
    if (forcar) { tx = c.x * 0.6; ty = d * (CY - 9); }
    c.alvoX = limitar(tx, -CX + 3, CX - 3);
    c.alvoY = limitar(ty, -CY + 3, CY - 3);

    if (this.lance && this.lance.A === c) return;  // durante o lance ele só conduz
    if (this.tentarGolDuvidoso(c)) return;
    c.decidir -= dt;
    const distGol = Math.hypot(c.x, d * CY - c.y);
    if (d * c.y > CY - 7) return this.chutar(c);
    const up = this.ultimoPasse;
    if (up && up.para === c && c.papel === "ata" && this.relogio - up.t < 4 && distGol < 26 && c.decidir > 0.5) {
      c.decidir = 0.5;   // recebeu na frente: vai finalizar rápido
    }
    if (c.decidir <= 0 && !forcar) {
      if (distGol < 22 && Math.random() < 0.3) this.chutar(c);
      else if (!this.passar(c)) c.decidir = 0.7;
    }
  }

  iaMarcacao(c) {
    const defs = this.doTime(1 - c.time).filter((j) => this.livre(j) && j.papel !== "gol");
    defs.sort((a, b) => dist(a, c) - dist(b, c));
    const [p1, p2] = defs;
    if (p1 && !(this.lance && p1 === this.lance.D)) {
      p1.alvoX = c.x + c.vx * 0.2;
      p1.alvoY = c.y + c.vy * 0.2;
      // Desarme limpo de rotina (sem queda, não é lance para apitar)
      if (!this.lance && c.graca <= 0 && dist(p1, c) < 1.3 && Math.random() < 0.022) {
        this.darBola(p1);
        c.graca = 0.6;
      }
    }
    if (p2 && !(this.lance && p2 === this.lance.D)) {
      const gy = dirDe(c.time) * CY;
      p2.alvoX = (c.x + 0) / 2;
      p2.alvoY = c.y + (gy - c.y) * 0.25;
    }
  }

  // Passe em profundidade no momento exato em que o atacante está no limite da linha
  tentarGolDuvidoso(c) {
    const G = this.golsDuvidosos[0];
    if (!G || this.minuto < G.minuto || this.lance) return false;
    if (this.minuto > G.minuto + 14) { this.golsDuvidosos.shift(); return false; }
    const d = dirDe(c.time);
    if (d * c.y < -8) return false;
    const linha = this.linhaDefesa(c.time);
    for (const f of this.doTime(c.time)) {
      if (f.papel !== "ata" || f === c || !this.livre(f)) continue;
      const margem = d * (f.y - linha);
      const quer = G.plano === "impedimento" ? margem > 0.3 && margem < 3 : margem > -2 && margem < -0.1;
      if (quer && d * f.y > 2 && d * f.y > d * c.y + 2 && dist(f, c) < 38) {
        this.forcarArea = null;
        this.golsDuvidosos.shift();
        this.passar(c, false, f);
        this.ultimoPasse.duvidoso = true;
        return true;
      }
    }
    return false;
  }

  passar(c, longo = false, forcado = null) {
    const d = dirDe(c.time);
    let melhor = forcado, ms = -Infinity;
    for (const t of forcado ? [] : this.doTime(c.time)) {
      if (t === c || !this.livre(t) || t.papel === "gol") continue;
      const dd = dist(t, c);
      if (dd < 7 || dd > (longo ? 45 : 36)) continue;
      const adv = this.maisPerto(this.doTime(1 - c.time), t);
      const pressao = adv ? Math.max(0, 6 - dist(adv, t)) : 0;
      const s = d * (t.y - c.y) * 0.9 - dd * 0.12 - pressao * 2 + aleat(0, 8) + (t.papel === "ata" ? 3 : 0);
      if (s > ms) { ms = s; melhor = t; }
    }
    if (!melhor) return false;
    const b = this.bola;
    const vel = longo ? 20 : 17;
    const eta = dist(melhor, c) / vel;
    const px = melhor.x + melhor.vx * eta * 0.9, py = melhor.y + melhor.vy * eta * 0.9;
    const dd = Math.hypot(px - b.x, py - b.y) || 1;
    b.vx = (px - b.x) / dd * vel;
    b.vy = (py - b.y) / dd * vel;
    b.vz = dd > 26 ? 7 : 0;
    b.dono = null;
    b.alvo = melhor;
    b.toque = c;
    b.tPasse = this.relogio;
    b.maoDe = null;
    c.decidir = 9;
    this.ultimoPasse = { t: this.relogio, de: c, para: melhor, ...this.calcularImpedimento(melhor) };
    this.passes.push(this.ultimoPasse);
    if (this.passes.length > 30) this.passes.shift();
    // De vez em quando o atacante domina com o braço
    if (d * melhor.y > CY * 0.35 && Math.random() < 0.05) b.maoPlano = melhor;
    som.chute(0.35);
    return true;
  }

  chutar(c) {
    const d = dirDe(c.time);
    const b = this.bola;
    const fora = Math.random() < 0.22;
    const tx = fora ? Math.sign(aleat(-1, 1)) * aleat(4.2, 7) : aleat(-3.3, 3.3);
    const ty = d * CY;   // mira no ponto exato onde a bola cruza a linha do gol
    const dd = Math.hypot(tx - b.x, ty - b.y);
    const vel = 25;
    b.vx = (tx - b.x) / dd * vel;
    b.vy = (ty - b.y) / dd * vel;
    b.vz = aleat(1, 3.2);
    b.dono = null;
    b.alvo = null;
    b.toque = c;
    // Controle de gols: mais defesas se a partida já tem muitos gols
    const gols = this.placar[0] + this.placar[1];
    // Chance de gol vai se ajustando para a partida ter uns 2 a 4 gols
    const esperado = (this.minuto / 90) * 2.0;
    let chanceGol = limitar((esperado + 0.6 - gols) * 0.25, 0.03, 0.38);
    const up = this.ultimoPasse;
    if (up && up.para === c && c.papel === "ata" && this.relogio - up.t < 5) chanceGol += 0.3;   // cara a cara
    b.chute = { de: c, noAlvo: !fora, defende: !fora && Math.random() > chanceGol };
    if (up && up.duvidoso && up.para === c && this.relogio - up.t < 6) {
      // O gol "no detalhe" entra: a decisão é do árbitro
      const tx2 = aleat(-2.6, 2.6);
      const dd2 = Math.hypot(tx2 - b.x, ty - b.y);
      b.vx = (tx2 - b.x) / dd2 * vel; b.vy = (ty - b.y) / dd2 * vel;
      b.chute = { de: c, noAlvo: true, defende: false };
    }
    c.decidir = 9;
    som.chute(0.7);
  }

  // ---------- Lances para o árbitro ----------

  agendarLances() {
    if (this.lance || !this.agenda.length) return;
    const c = this.bola.dono;
    if (this.minuto < this.agenda[0]) return;
    if (!c || c.papel === "gol" || Math.abs(c.y) > CY - 4 || this.bola.chute) return;

    // Às vezes o lance acontece dentro da área (chance de pênalti)
    if (!this.forcarArea && Math.random() < 0.35) {
      this.forcarArea = { time: c.time, ate: this.relogio + 10 };
    }
    if (this.forcarArea) {
      const dentro = this.naArea(c.x, c.y + dirDe(c.time) * 1.5, c.time);
      if (this.forcarArea.time !== c.time || this.relogio > this.forcarArea.ate) {
        this.forcarArea = null;
      } else if (!dentro) {
        return;
      }
    }
    this.agenda.shift();
    this.iniciarLance(c);
  }

  iniciarLance(A) {
    const defs = this.doTime(1 - A.time).filter((j) => this.livre(j) && j.papel !== "gol");
    const D = this.maisPerto(defs, A);
    if (!D) return;
    const tipo = sortearPeso(this.liga.pesos);
    this.forcarArea = null;
    this.lance = { tipo, A, D, t0: this.relogio, tc: null, fase: "aproximacao", area: false, x: A.x, y: A.y, vantagem: 0, tocou: false };
    // O defensor começa a chegar de onde está
    D.lunge = 0;
  }

  atualizarLance(dt) {
    const L = this.lance;
    if (!L) return;
    const { A, D } = L;
    const b = this.bola;

    if (L.fase === "aproximacao") {
      const t = this.relogio - L.t0;
      // Atacante conduz em linha reta
      if (b.dono === A) {
        A.alvoX = A.x + Math.cos(A.ang) * 6;
        A.alvoY = A.y + Math.sin(A.ang) * 6;
      }
      const velD = L.tipo === "violenta" ? 12.5 : L.tipo === "imprudente" ? 10.5 : 9.2;
      const alvo = L.tipo === "limpa" ? b : { x: A.x + A.vx * 0.15, y: A.y + A.vy * 0.15 };
      const dd = dist(D, alvo);

      if (L.tipo === "simulacao" && dd < 2.1) {
        // O defensor freia antes de encostar; o atacante se joga
        D.vx *= 0.3; D.vy *= 0.3;
        return this.contato(L);
      }
      // Imprudente: o atacante já tocou a bola para frente quando o carrinho chega
      if (L.tipo === "imprudente" && dd < 2.6 && b.dono === A) {
        b.dono = null;
        b.vx = Math.cos(A.ang) * 9; b.vy = Math.sin(A.ang) * 9;
        b.toque = A;
      }
      const ux = (alvo.x - D.x) / (dd || 1), uy = (alvo.y - D.y) / (dd || 1);
      D.vx = ux * velD; D.vy = uy * velD;
      D.alvoX = D.x + ux * 3; D.alvoY = D.y + uy * 3;
      D.lunge = Math.min(1, D.lunge + dt * 3);
      const encostou = L.tipo === "limpa" ? dd < 1.0 : dd < 1.05;
      if (encostou || t > 1.6) this.contato(L);
      return;
    }

    if (L.fase === "janela") {
      if (b.dono && b.dono.time === A.time) L.vantagem += dt;
      if (this.relogio >= L.fimJanela) {
        const item = this.resolverLance({ apitou: false });
        this.aoEvento("naoApitado", item);
      }
    }
  }

  contato(L) {
    const { A, D } = L;
    const b = this.bola;
    L.tc = this.relogio;
    L.x = A.x; L.y = A.y;
    L.area = this.naArea(A.x, A.y, A.time);
    L.fase = "janela";
    L.fimJanela = this.relogio + this.liga.janela;
    const mx = (A.x + D.x) / 2, my = (A.y + D.y) / 2;
    const angA = A.ang;

    if (L.tipo === "limpa") {
      // Bola primeiro: a bola muda de direção ANTES do atacante cair
      const ang = Math.atan2(D.vy, D.vx) + aleat(-0.6, 0.6);
      b.dono = null;
      b.vx = Math.cos(ang) * 10; b.vy = Math.sin(ang) * 10;
      b.toque = D;
      this.marcas.push({ t: this.relogio, x: b.x, y: b.y, tipo: "bola" });
      this.derrubar(D, 0.9, Math.atan2(D.vy, D.vx), 1.2);
      setTimeoutJogo(this, 0.18, () => this.derrubar(A, 1.5, angA, 1.0));
    } else if (L.tipo === "simulacao") {
      if (b.dono === A) { b.dono = null; b.vx = Math.cos(angA) * 4; b.vy = Math.sin(angA) * 4; }
      this.derrubar(A, 1.9, angA + aleat(-0.5, 0.5), 1.4, true);
      this.marcas.push({ t: this.relogio, x: mx, y: my, tipo: "semcontato", r: dist(A, D) });
    } else {
      if (b.dono === A) {
        b.dono = null;
        b.vx = A.vx * 0.85; b.vy = A.vy * 0.85;
        b.toque = A;
      }
      const forca = { falta: 1, imprudente: 1.6, violenta: 2.4 }[L.tipo];
      this.derrubar(A, 1.6 + forca * 0.8, angA + aleat(-0.4, 0.4), 0.9 * forca);
      this.derrubar(D, 0.7 + forca * 0.3, Math.atan2(D.vy, D.vx), 0.8);
      this.marcas.push({ t: this.relogio, x: mx, y: my, tipo: L.tipo === "violenta" ? "impacto" : "contato" });
      if (L.tipo === "violenta") this.flash = 0.25;

      // Falta no último homem com chance clara de gol = vermelho
      if (L.tipo === "falta") {
        const d = dirDe(A.time);
        const distGol = Math.hypot(A.x, d * CY - A.y);
        const cobertura = this.doTime(D.time).some((j) => j !== D && j.papel !== "gol" && !j.expulso && d * j.y > d * A.y - 0.5);
        if (d * A.y > 0 && distGol < 32 && !cobertura) L.tipo = "dogso";
      }
    }
    som.contato(L.tipo === "violenta" ? 1 : 0.5);
  }

  derrubar(j, tempo, ang, empurrao, teatral = false) {
    j.caido = tempo;
    j.quedaAng = ang;
    j.vx = Math.cos(ang) * 4 * empurrao;
    j.vy = Math.sin(ang) * 4 * empurrao;
    j.teatral = teatral;
    for (let i = 0; i < 8; i++) {
      this.particulas.push({ x: j.x, y: j.y, vx: aleat(-2, 2), vy: aleat(-2, 2), vida: aleat(0.4, 0.8), r: aleat(0.2, 0.5) });
    }
  }

  // O árbitro apertou o apito
  apitar() {
    if (this.estado !== "jogo") return;
    som.apito(1);
    const L = this.lance;
    if (L && L.fase === "janela") {
      this.estado = "decisao";
      this.aoEvento("decisao", L);
      return;
    }
    if (L && L.fase === "aproximacao") {
      // Apitou antes do contato: conta como apito sem motivo
      this.lance = null;
    }
    // Apito sem lance
    this.registro.push({ tipo: "apito", pontos: 0, max: 2, msg: "Apitou sem nenhum lance" });
    this.aoEvento("feedback", { certo: false, titulo: "Apito sem motivo", texto: "Não teve contato nesse momento. Bola ao chão.", moedas: 0 });
    const c = this.bola.dono || this.maisPerto(this.doTime(this.posse).filter((j) => this.livre(j)), this.bola);
    if (c) this.reinicio(c, 1.2);
  }

  // Resultado da decisão do árbitro: { apitou, tipo, cartao }
  resolverLance(decisao) {
    const L = this.lance;
    if (!L) return null;
    const v = VERDADES[L.tipo];
    const esperadoTipo = v.tipo === "falta" && L.area ? "penalti" : v.tipo;
    let esperadoCartao = v.cartao;
    if (L.tipo === "dogso" && L.area) esperadoCartao = "amarelo";   // na área, tentando a bola: amarelo
    const nomeCerto = L.tipo === "dogso" && L.area ? "Pênalti em chance clara de gol (amarelo, tentou jogar a bola)" : v.nome;

    let pontos = 0, titulo = "", texto = "";
    const marcacao = { falta: "falta", penalti: "pênalti", simulacao: "simulação", nada: "lance normal" };
    const cartaoNome = { nenhum: "sem cartão", amarelo: "cartão amarelo", vermelho: "cartão vermelho" };
    const resposta = v.apitar
      ? `${marcacao[esperadoTipo]}${esperadoCartao !== "nenhum" ? " + " + cartaoNome[esperadoCartao] : ""}`
      : "deixar o jogo seguir";

    if (!decisao.apitou) {
      if (!v.apitar) {
        pontos = 3; titulo = "Certo! Deixou seguir";
        texto = "O defensor tocou na bola primeiro. Não era falta.";
      } else if (L.tipo === "falta" && !L.area && L.vantagem >= 1.2) {
        pontos = 3; titulo = "Boa vantagem! 👏";
        texto = "Era falta, mas o time atacante ficou com a bola. Dar vantagem foi o certo.";
      } else {
        pontos = 0; titulo = "Você deixou passar";
        texto = `Era ${nomeCerto.toLowerCase()}. O certo: ${resposta}.`;
      }
    } else if (!v.apitar) {
      pontos = decisao.tipo === "nada" ? 1 : 0;
      titulo = "Não era falta";
      texto = "O defensor tocou na bola primeiro. O certo era deixar o jogo seguir.";
    } else {
      pontos = 1;
      const tipoOk = decisao.tipo === esperadoTipo;
      const cartaoOk = decisao.cartao === esperadoCartao;
      if (tipoOk) pontos++;
      if (cartaoOk) pontos++;
      if (pontos === 3) { titulo = "Decisão perfeita! ✅"; texto = `${nomeCerto}: ${resposta}.`; }
      else { titulo = pontos === 2 ? "Quase!" : "Decisão errada"; texto = `Era ${nomeCerto.toLowerCase()}. O certo: ${resposta}.`; }
    }

    const item = {
      tipo: "lance", pontos, max: 3, titulo, texto, verdade: L.tipo, area: L.area,
      // O VAR revisa: lances na área e cartões vermelhos (dados ou que deveriam ter sido dados)
      chave: L.area || esperadoCartao === "vermelho" || decisao.cartao === "vermelho", decisao, esperadoTipo, esperadoCartao
    };
    this.registro.push(item);
    this.lanceAnterior = L;
    if (!decisao.apitou) this.lance = null;
    return item;
  }

  // O VAR chamou: o árbitro revê o último lance e pode mudar a decisão
  reavaliar(decisao) {
    const anterior = this.registro.pop();
    const L = this.lanceAnterior;
    this.lance = L;
    const item = this.resolverLance(decisao);
    if (item.pontos === 3) {
      item.pontos = 2;   // corrigiu com ajuda do VAR: vale um pouco menos
      item.titulo = "Corrigido no VAR 📺";
    }
    item.var = true;
    item.anterior = anterior;
    this.lance = decisao.apitou ? L : null;
    return item;
  }

  // Aplica no jogo o que o árbitro marcou e retoma a partida
  aplicarDecisao(decisao) {
    const L = this.lance;
    this.lance = null;
    if (!L) { this.estado = "jogo"; return; }
    const { A, D } = L;
    if (decisao.cartao !== "nenhum" && decisao.tipo !== "nada") {
      const punido = decisao.tipo === "simulacao" ? A : D;
      this.mostrarCartao(punido, decisao.cartao);
    }
    for (const j of [A, D]) if (!j.expulso) j.caido = Math.min(j.caido, 0.6);

    if (decisao.tipo === "penalti") {
      this.iniciarPenalti(A.time);
    } else if (decisao.tipo === "falta") {
      const cobrador = this.livre(A) && !A.expulso ? A : this.maisPerto(this.doTime(A.time).filter((j) => !j.expulso), A);
      this.bola.x = L.x; this.bola.y = L.y;
      cobrador.x = L.x; cobrador.y = L.y - dirDe(A.time) * 0.6;
      this.reinicio(cobrador, 1.4);
    } else if (decisao.tipo === "simulacao") {
      const cobrador = this.livre(D) && !D.expulso ? D : this.maisPerto(this.doTime(D.time).filter((j) => !j.expulso), D);
      this.reinicio(cobrador, 1.4);
    } else {
      const quem = this.maisPerto(this.doTime(this.posse).filter((j) => !j.expulso), this.bola);
      this.reinicio(quem, 1.2);
    }
  }

  mostrarCartao(j, cor) {
    let final = cor;
    if (cor === "amarelo") {
      j.amarelos++;
      if (j.amarelos >= 2) final = "segundo";
    }
    if (final !== "amarelo") {
      j.expulso = true;
      j.saindoAte = this.relogio + 3;
    }
    this.aoEvento("cartao", { jogador: j, cor: final, time: this.times[j.time][0] });
    som.cartao();
  }

  // ---------- Pênalti ----------

  iniciarPenalti(time) {
    const d = dirDe(time);
    const cobrador = this.doTime(time).filter((j) => j.papel === "ata")[0] || this.doTime(time)[9] || this.doTime(time)[1];
    const gk = this.goleiro(1 - time);
    this.penalti = { time, cobrador, gk, t: 0, gol: Math.random() < 0.76, lado: Math.random() < 0.5 ? -1 : 1 };
    const b = this.bola;
    Object.assign(b, { x: 0, y: d * (CY - 11), z: 0, vx: 0, vy: 0, vz: 0, dono: null, alvo: null, chute: null });
    cobrador.x = 0.5; cobrador.y = b.y - d * 2.5;
    gk.x = 0; gk.y = d * (CY - 0.6);
    for (const j of this.jogadores) {
      if (j === cobrador || j === gk || j.expulso) continue;
      j.alvoX = limitar(j.x, -AREA_X + 2, AREA_X - 2);
      j.alvoY = d * (CY - AREA_Y - 2 - Math.random() * 6);
    }
    this.estado = "penalti";
    this.aoEvento("aviso", "⚽ Pênalti!");
  }

  atualizarPenalti(dt) {
    const P = this.penalti;
    P.t += dt;
    const d = dirDe(P.time);
    const b = this.bola;
    P.cobrador.alvoX = b.x; P.cobrador.alvoY = b.y - d * 0.6;
    P.gk.alvoX = 0; P.gk.alvoY = d * (CY - 0.6);
    if (P.t > 1.5 && !P.chutou) {
      P.chutou = true;
      const tx = P.lado * aleat(1.2, 3.1);
      const dd = Math.hypot(tx - b.x, d * (CY + 1) - b.y);
      b.vx = (tx - b.x) / dd * 24; b.vy = (d * (CY + 1) - b.y) / dd * 24; b.vz = 1.5;
      b.toque = P.cobrador;
      b.chute = { de: P.cobrador, noAlvo: true, defende: !P.gol, penalti: true };
      P.gk.alvoX = (P.gol ? -P.lado : P.lado) * 3;
      som.chute(0.8);
    }
    if (P.chutou) this.estado = "jogo";
  }

  // ---------- Bola ----------

  atualizarBola(dt) {
    const b = this.bola;
    if (b.dono) {
      const c = b.dono;
      if (c.expulso || c.caido > 0) { b.dono = null; return; }
      const sp = Math.hypot(c.vx, c.vy);
      b.x = c.x + Math.cos(c.ang) * 0.75;
      b.y = c.y + Math.sin(c.ang) * 0.75;
      b.z = 0;
      b.giro += sp * dt * 2;
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vz -= 15 * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = b.vz < -2 ? -b.vz * 0.45 : 0;
      const atrito = Math.exp(-0.9 * dt);
      b.vx *= atrito; b.vy *= atrito;
    }
    b.giro += Math.hypot(b.vx, b.vy) * dt * 2;

    // Chute: goleiro defende?
    if (b.chute) {
      const gk = this.goleiro(1 - b.chute.de.time);
      const chegou = gk && Math.abs(b.y - gk.y) < 1.4;
      if (gk && b.chute.defende && chegou && b.z < 2.6) {
        gk.x = b.x - Math.sign(b.x - gk.x) * 0.4;   // o goleiro se estica até a bola
        gk.lunge = 1;
        b.chute = null;
        this.darBola(gk);
        gk.decidir = 1.6;
        this.aoEvento("aviso", "🧤 Defesa!");
        som.torcida(0.4);
        return;
      }
    }

    // Saiu pela linha de fundo: gol ou tiro de meta
    if (Math.abs(b.y) > CY) {
      const timeGol = b.y < 0 ? 0 : 1;   // time que ataca para esse lado
      if (Math.abs(b.x) < GOL_X && b.z < 2.44) return this.marcarGol(timeGol);
      const gk = this.goleiro(1 - timeGol);
      b.x = 0; b.y = Math.sign(b.y) * (CY - 5);
      gk.x = 0; gk.y = b.y;
      return this.reinicio(gk, 1.4);
    }
    // Lateral
    if (Math.abs(b.x) > CX) {
      const time = b.toque ? 1 - b.toque.time : 1 - this.posse;
      b.x = Math.sign(b.x) * (CX - 0.3);
      const j = this.maisPerto(this.doTime(time).filter((p) => this.livre(p) && p.papel !== "gol"), b);
      if (j) { j.x = b.x; j.y = b.y; this.reinicio(j, 1.2); }
      return;
    }

    if (b.chute && !b.chute.penalti) {
      // chute em andamento: ninguém intercepta além do goleiro
      return;
    }
    if (b.chute && b.chute.penalti) return;

    // Alguém domina a bola
    for (const j of this.jogadores) {
      if (!this.livre(j) || b.z > 1.4) continue;
      if (this.lance && this.lance.fase === "aproximacao" && (j === this.lance.D || j === this.lance.A)) continue;
      if (j === b.toque && this.relogio - (b.tPasse || -9) < 0.4) continue;   // quem passou não domina de novo na hora
      const alcance = j === b.alvo ? 1.3 : 0.95;
      if (dist(j, b) < alcance) {
        const profundidade = this.ultimoPasse && this.ultimoPasse.duvidoso && b.alvo === this.ultimoPasse.para;
        if (b.alvo && j.time !== b.alvo.time && (profundidade || Math.random() < 0.5)) continue;
        this.darBola(j);
        if (j.braco > 0) {
          // dominou com o braço: a bola dá uma desviada
          b.dono = null; b.vx = Math.cos(j.ang) * 3; b.vy = Math.sin(j.ang) * 3;
          setTimeoutJogo(this, 0.25, () => { if (!b.dono && dist(j, b) < 2.5) this.darBola(j); });
        }
        break;
      }
    }
  }

  marcarGol(time) {
    const b = this.bola;
    b.vx *= 0.2; b.vy *= 0.2;
    const autor = b.chute ? b.chute.de : b.toque;
    let verdade = "legal";
    if (b.chute && b.chute.penalti) verdade = "penalti";
    else if (b.maoDe && b.maoDe === autor) verdade = "mao";
    else if (this.ultimoPasse && this.ultimoPasse.para === autor && this.ultimoPasse.impedido && this.relogio - this.ultimoPasse.t < 9) verdade = "impedimento";
    b.chute = null;
    this.golPendente = { time, autor, verdade, t: this.relogio, passe: this.ultimoPasse };
    som.torcida(1);
    this.flash = 0.3;

    if (verdade === "penalti") {
      // Pênalti convertido não precisa de revisão
      this.placar[time]++;
      this.aoEvento("aviso", `⚽ GOL de pênalti! ${this.times[time][0]}`);
      this.aoEvento("placar");
      this.golPendente = null;
      this.estado = "parado";
      setTimeoutJogo(this, 0.01, () => this.saidaDeBola(1 - time));
      return;
    }
    this.estado = "gol";
    this.aoEvento("gol", this.golPendente);
  }

  decidirGol(escolha) {
    const G = this.golPendente;
    const certo = escolha === G.verdade;
    const nomes = { legal: "gol legal", impedimento: "impedimento", mao: "toque de mão do atacante" };
    const item = {
      tipo: "gol", pontos: certo ? 3 : 0, max: 3, chave: true,
      titulo: certo ? (escolha === "legal" ? "Gol validado corretamente ✅" : "Gol anulado corretamente ✅") : "Decisão errada no gol",
      texto: certo ? `Era ${nomes[G.verdade]}.` : `Era ${nomes[G.verdade]}. Você marcou ${nomes[escolha]}.`,
      verdade: G.verdade, escolha
    };
    this.registro.push(item);
    return item;
  }

  aplicarGol(escolha) {
    const G = this.golPendente;
    this.golPendente = null;
    if (escolha === "legal") {
      this.placar[G.time]++;
      this.aoEvento("placar");
      this.saidaDeBola(1 - G.time);
    } else {
      const gk = this.goleiro(1 - G.time);
      this.bola.x = 0; this.bola.y = dirDe(G.time) * (CY - 6);
      gk.x = 0; gk.y = this.bola.y;
      this.reinicio(gk, 1.5);
    }
  }

  // ---------- Movimento ----------

  moverTodos(dt, parado) {
    const vel = this.liga.velocidade;
    for (const j of this.jogadores) {
      if (j.saiu) continue;
      if (j.braco > 0) j.braco -= dt;
      if (j.expulso) {
        // Sai de campo andando
        j.alvoX = Math.sign(j.x || 1) * (CX + 6);
        j.alvoY = j.y;
        if (this.relogio > j.saindoAte + 4) j.saiu = true;
      }
      if (j.caido > 0) {
        j.caido -= dt;
        j.x += j.vx * dt; j.y += j.vy * dt;
        const freio = Math.exp(-4 * dt);
        j.vx *= freio; j.vy *= freio;
        continue;
      }
      if (this.lance && this.lance.fase === "aproximacao" && j === this.lance.D) {
        j.x += j.vx * dt; j.y += j.vy * dt;
        j.ang = Math.atan2(j.vy, j.vx);
        j.fase += Math.hypot(j.vx, j.vy) * dt * 1.6;
        continue;
      }
      j.lunge = Math.max(0, j.lunge - dt * 2);
      const comBola = this.bola.dono === j;
      const max = (j.papel === "gol" ? (j.mergulho ? 11 : 5) : comBola ? 6.4 : 7.4) * vel * (parado ? 0.7 : 1) * (j.expulso ? 0.35 : 1);
      const dx = j.alvoX - j.x, dy = j.alvoY - j.y;
      const dd = Math.hypot(dx, dy);
      const desejado = dd < 0.3 ? 0 : Math.min(max, dd * 2.2);
      const tvx = dd > 0.01 ? (dx / dd) * desejado : 0;
      const tvy = dd > 0.01 ? (dy / dd) * desejado : 0;
      const k = 1 - Math.exp(-6 * dt);   // aceleração suave
      j.vx += (tvx - j.vx) * k;
      j.vy += (tvy - j.vy) * k;
      j.x += j.vx * dt;
      j.y += j.vy * dt;
      const sp = Math.hypot(j.vx, j.vy);
      if (sp > 0.4) {
        const alvoAng = Math.atan2(j.vy, j.vx);
        let da = alvoAng - j.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        j.ang += da * Math.min(1, dt * 10);
      }
      j.fase += sp * dt * 1.6;
    }
    this.moverArbitro(dt);
  }

  moverArbitro(dt) {
    const r = this.arbitro, b = this.bola;
    // Fica na diagonal, um pouco afastado da bola
    const tx = limitar(b.x + 9, -CX + 2, CX - 2), ty = limitar(b.y + 7, -CY + 6, CY - 6);
    const dx = tx - r.x, dy = ty - r.y, dd = Math.hypot(dx, dy);
    const v = Math.min(7, dd * 1.5);
    const k = 1 - Math.exp(-4 * dt);
    r.vx += ((dd > 0.01 ? dx / dd * v : 0) - r.vx) * k;
    r.vy += ((dd > 0.01 ? dy / dd * v : 0) - r.vy) * k;
    r.x += r.vx * dt; r.y += r.vy * dt;
    const sp = Math.hypot(r.vx, r.vy);
    if (sp > 0.4) r.ang = Math.atan2(r.vy, r.vx);
    r.fase += sp * dt * 1.6;
  }

  atualizarParticulas(dt) {
    for (const p of this.particulas) {
      p.vida -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.95; p.vy *= 0.95;
    }
    this.particulas = this.particulas.filter((p) => p.vida > 0);
    if (this.timers) {
      for (const t of this.timers) t.resta -= dt;
      const prontos = this.timers.filter((t) => t.resta <= 0);
      this.timers = this.timers.filter((t) => t.resta > 0);
      for (const t of prontos) t.fn();
    }
  }

  // ---------- Gravação (replay) ----------

  gravar() {
    this.contaGravar = (this.contaGravar || 0) + 1;
    if (this.contaGravar % 2) return;   // 30 quadros por segundo
    const f = {
      t: this.relogio,
      j: this.jogadores.map((j) => [j.x, j.y, j.ang, j.caido > 0 ? j.quedaAng : null, j.fase, j.saiu ? 1 : 0, j.braco > 0 ? 1 : 0, j.lunge]),
      b: [this.bola.x, this.bola.y, this.bola.z, this.bola.giro],
      r: [this.arbitro.x, this.arbitro.y, this.arbitro.ang, this.arbitro.fase]
    };
    // Durante paradas o relógio não anda; empurra o tempo um pouquinho para manter a ordem
    const ult = this.frames[this.frames.length - 1];
    if (ult && f.t <= ult.t) f.t = ult.t + 1 / 30;
    this.frames.push(f);
    const limite = f.t - GRAVAR_SEG;
    while (this.frames.length && this.frames[0].t < limite) this.frames.shift();
  }

  // Monta o replay de um lance ou gol
  replay(qual) {
    let inicio, fim, foco, passe = null;
    if (qual === "gol" && this.golPendente) {
      const G = this.golPendente;
      passe = G.passe && G.t - G.passe.t < 9 ? G.passe : null;
      inicio = Math.max(passe ? passe.t - 1.2 : G.t - 4, G.t - 8);
      fim = G.t + 0.2;
      foco = null;
    } else {
      const L = this.lance || this.lanceAnterior;
      if (!L || !L.tc) return null;
      inicio = L.tc - 2.2;
      fim = L.tc + 1.3;
      foco = { x: L.x, y: L.y };
      var seguir = this.jogadores.indexOf(L.A);
    }
    const frames = this.frames.filter((f) => f.t >= inicio && f.t <= fim);
    const marcas = this.marcas.filter((m) => m.t >= inicio - 0.1 && m.t <= fim + 0.1);
    return { frames, inicio, fim, foco, passe, marcas, seguir: seguir ?? null };
  }

  resumo() {
    const pontos = this.registro.reduce((s, r) => s + r.pontos, 0);
    const max = this.registro.reduce((s, r) => s + r.max, 0);
    const nota = max ? Math.round((pontos / max) * 100) / 10 : 7;
    return { nota, pontos, max, registro: this.registro, placar: this.placar };
  }
}

function setTimeoutJogo(P, seg, fn) {
  (P.timers || (P.timers = [])).push({ resta: seg, fn });
}

// ---------- Torcida (pontinhos coloridos nas arquibancadas) ----------

function gerarTorcida() {
  const cores = ["#f87171", "#fbbf24", "#60a5fa", "#f9fafb", "#34d399", "#a78bfa", "#fb923c", "#e5e7eb"];
  const pts = [];
  for (let i = 0; i < 1600; i++) {
    const lado = Math.floor(Math.random() * 4);
    const prof = aleat(9, 20);
    let x, y;
    if (lado === 0) { x = -CX - prof; y = aleat(-CY - 20, CY + 20); }
    else if (lado === 1) { x = CX + prof; y = aleat(-CY - 20, CY + 20); }
    else if (lado === 2) { y = -CY - prof; x = aleat(-CX - 20, CX + 20); }
    else { y = CY + prof; x = aleat(-CX - 20, CX + 20); }
    pts.push({ x, y, c: cores[Math.floor(Math.random() * cores.length)], f: Math.random() * 6 });
  }
  return pts;
}

// ---------- Desenho ----------
// cena = { jogadores: [{...dados do jogador, x, y, ang, quedaAng, fase, saiu, braco, lunge}], bola, arbitro }

function desenharCena(ctx, W, H, cam, P, cena, extras = {}) {
  const s = W / cam.larg;
  const tx = (x) => W / 2 + (x - cam.cx) * s;
  const ty = (y) => H / 2 + (y - cam.cy) * s;

  // Arquibancada
  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, "#1b2433");
  fundo.addColorStop(1, "#111827");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);
  const t = performance.now() / 1000;
  for (const p of P.torcida) {
    const x = tx(p.x), y = ty(p.y);
    if (x < -5 || x > W + 5 || y < -5 || y > H + 5) continue;
    const pulo = extras.festa ? Math.sin(t * 9 + p.f) * 0.35 * s : 0;
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(x, y + pulo, Math.max(1.2, s * 0.42), 0, Math.PI * 2);
    ctx.fill();
  }

  // Gramado com faixas
  ctx.fillStyle = "#2e7d32";
  ctx.fillRect(tx(-CX - 5), ty(-CY - 5), (CX + 5) * 2 * s, (CY + 5) * 2 * s);
  for (let i = 0; i < 20; i++) {
    const y0 = -CY + i * (2 * CY / 20);
    ctx.fillStyle = i % 2 ? "#34893a" : "#2f8035";
    ctx.fillRect(tx(-CX - 5), ty(y0), (CX + 5) * 2 * s, (2 * CY / 20) * s + 1);
  }
  // Sombra suave nas bordas do gramado
  const vin = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vin.addColorStop(0, "rgba(0,0,0,0)");
  vin.addColorStop(1, "rgba(0,0,0,0.22)");

  // Linhas do campo
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.lineJoin = "round";
  const ret = (x1, y1, x2, y2) => ctx.strokeRect(tx(x1), ty(y1), (x2 - x1) * s, (y2 - y1) * s);
  ret(-CX, -CY, CX, CY);
  ctx.beginPath(); ctx.moveTo(tx(-CX), ty(0)); ctx.lineTo(tx(CX), ty(0)); ctx.stroke();
  ctx.beginPath(); ctx.arc(tx(0), ty(0), 9.15 * s, 0, Math.PI * 2); ctx.stroke();
  for (const sg of [-1, 1]) {
    const yg = sg * CY;
    ret(-AREA_X, Math.min(yg, yg - sg * AREA_Y), AREA_X, Math.max(yg, yg - sg * AREA_Y));
    ret(-PEQ_X, Math.min(yg, yg - sg * PEQ_Y), PEQ_X, Math.max(yg, yg - sg * PEQ_Y));
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(tx(0), ty(yg - sg * 11), Math.max(1.5, s * 0.22), 0, Math.PI * 2); ctx.fill();
    // meia-lua
    ctx.beginPath();
    const a0 = sg < 0 ? 0.2 * Math.PI : 1.2 * Math.PI, a1 = sg < 0 ? 0.8 * Math.PI : 1.8 * Math.PI;
    ctx.arc(tx(0), ty(yg - sg * 11), 9.15 * s, a0, a1);
    ctx.stroke();
    // Gol com rede
    const gy = ty(yg), prof = 2.2 * s * sg;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(tx(-GOL_X), gy, GOL_X * 2 * s, prof);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (let x = -GOL_X; x <= GOL_X; x += 0.6) { ctx.beginPath(); ctx.moveTo(tx(x), gy); ctx.lineTo(tx(x), gy + prof); ctx.stroke(); }
    for (let k = 0; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(tx(-GOL_X), gy + prof * k / 3); ctx.lineTo(tx(GOL_X), gy + prof * k / 3); ctx.stroke(); }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, s * 0.25);
    ctx.beginPath(); ctx.moveTo(tx(-GOL_X), gy); ctx.lineTo(tx(-GOL_X), gy + prof); ctx.lineTo(tx(GOL_X), gy + prof); ctx.lineTo(tx(GOL_X), gy); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1.5, s * 0.14);
  }

  // Linha de impedimento (replay)
  if (extras.linhas) {
    for (const ln of extras.linhas) {
      ctx.strokeStyle = ln.cor;
      ctx.lineWidth = Math.max(2, s * 0.18);
      ctx.setLineDash([s * 0.9, s * 0.5]);
      ctx.beginPath(); ctx.moveTo(tx(-CX), ty(ln.y)); ctx.lineTo(tx(CX), ty(ln.y)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Poeira das quedas
  for (const p of cena.particulas || []) {
    ctx.fillStyle = `rgba(214,200,160,${p.vida * 0.6})`;
    ctx.beginPath(); ctx.arc(tx(p.x), ty(p.y), p.r * s, 0, Math.PI * 2); ctx.fill();
  }

  // Jogadores, árbitro e bola, de cima para baixo
  const lista = cena.jogadores.filter((j) => !j.saiu).map((j) => ({ tipo: "j", o: j, y: j.y }));
  lista.push({ tipo: "r", o: cena.arbitro, y: cena.arbitro.y });
  lista.sort((a, b) => a.y - b.y);
  for (const it of lista) {
    if (it.tipo === "j") desenharJogador(ctx, it.o, tx(it.o.x), ty(it.o.y), s, P, extras);
    else desenharArbitro(ctx, it.o, tx(it.o.x), ty(it.o.y), s, extras.corArbitro);
  }
  desenharBola(ctx, cena.bola, tx, ty, s);

  // Marcas da câmera tática
  if (extras.marcas) {
    for (const m of extras.marcas) {
      const x = tx(m.x), y = ty(m.y);
      ctx.lineWidth = 3;
      if (m.tipo === "bola") { ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x, y, s * 1.2, 0, Math.PI * 2); ctx.stroke(); rotulo(ctx, "toque na bola", x, y - s * 1.8, "#ffffff"); }
      if (m.tipo === "contato") { ctx.strokeStyle = "#f97316"; ctx.beginPath(); ctx.arc(x, y, s * 1.2, 0, Math.PI * 2); ctx.stroke(); rotulo(ctx, "contato", x, y - s * 1.8, "#fdba74"); }
      if (m.tipo === "impacto") { ctx.strokeStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x, y, s * 1.5, 0, Math.PI * 2); ctx.stroke(); rotulo(ctx, "entrada forte", x, y - s * 2.1, "#fca5a5"); }
      if (m.tipo === "semcontato") { ctx.strokeStyle = "#38bdf8"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, s * Math.max(1, m.r / 2), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); rotulo(ctx, "sem contato", x, y - s * 1.9, "#7dd3fc"); }
      if (m.tipo === "mao") { ctx.strokeStyle = "#e879f9"; ctx.beginPath(); ctx.arc(x, y, s * 1.2, 0, Math.PI * 2); ctx.stroke(); rotulo(ctx, "bola no braço", x, y - s * 1.8, "#f0abfc"); }
    }
  }

  ctx.fillStyle = vin;
  ctx.fillRect(0, 0, W, H);
  if (P.flash > 0 && !extras.replay) {
    ctx.fillStyle = `rgba(255,255,255,${P.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function rotulo(ctx, texto, x, y, cor) {
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(texto, x, y);
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
}

function desenharJogador(ctx, j, x, y, s, P, extras) {
  const kit = P.times[j.time];
  const camisa = j.papel === "gol" ? (j.time === 0 ? "#a3e635" : "#c084fc") : kit[1];
  const detalhe = j.papel === "gol" ? "#1f2937" : kit[2];
  const R = s * 1.2;    // tamanho de desenho (um pouco maior que o real, para enxergar)
  const alpha = j.expulso ? 0.75 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (j.quedaAng != null) {
    // Caído no chão: corpo esticado
    ctx.translate(x, y);
    ctx.rotate(j.quedaAng);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(R * 0.3, R * 0.25, R * 1.7, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = j.pele;
    ctx.beginPath(); ctx.ellipse(-R * 1.1, -R * 0.25, R * 0.55, R * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-R * 1.1, R * 0.25, R * 0.55, R * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, clarear(camisa, 0.25)); g.addColorStop(1, camisa);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.95, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = j.pele;
    ctx.beginPath(); ctx.arc(R * 1.15, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = j.cabelo;
    ctx.beginPath(); ctx.arc(R * 1.25, 0, R * 0.33, -Math.PI / 2, Math.PI / 2); ctx.fill();
    if (j.teatral) {
      // braços para cima (se jogando)
      ctx.strokeStyle = j.pele; ctx.lineWidth = R * 0.22; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(R * 0.6, -R * 0.5); ctx.lineTo(R * 1.6, -R * 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R * 0.6, R * 0.5); ctx.lineTo(R * 1.6, R * 1.1); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(x + R * 0.25, y + R * 0.3, R * 0.95, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();

  ctx.translate(x, y);
  ctx.rotate(j.ang);
  const passo = Math.sin(j.fase * 2.2) * R * 0.45;
  const carrinho = j.lunge > 0.3;
  // Pernas
  ctx.fillStyle = j.pele;
  if (carrinho) {
    ctx.beginPath(); ctx.ellipse(R * 0.9, -R * 0.2, R * 0.7, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R * 0.8, R * 0.22, R * 0.6, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(passo, -R * 0.28, R * 0.34, R * 0.17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-passo, R * 0.28, R * 0.34, R * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Braços
  const balanco = Math.sin(j.fase * 2.2) * R * 0.25;
  ctx.fillStyle = j.pele;
  ctx.beginPath(); ctx.arc(-balanco * 0.6, -R * 0.62, R * 0.17, 0, Math.PI * 2); ctx.fill();
  if (j.braco) {
    ctx.strokeStyle = j.pele; ctx.lineWidth = R * 0.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, R * 0.55); ctx.lineTo(R * 0.7, R * 1.1); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(balanco * 0.6, R * 0.62, R * 0.17, 0, Math.PI * 2); ctx.fill();
  }
  // Corpo (camisa) com brilho
  const g = ctx.createRadialGradient(-R * 0.15, -R * 0.2, R * 0.1, 0, 0, R * 0.8);
  g.addColorStop(0, clarear(camisa, 0.35));
  g.addColorStop(1, camisa);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.5, R * 0.68, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = detalhe;
  ctx.lineWidth = Math.max(1, R * 0.1);
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.5, R * 0.68, 0, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
  // Cabeça
  ctx.fillStyle = j.pele;
  ctx.beginPath(); ctx.arc(R * 0.05, 0, R * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = j.cabelo;
  ctx.beginPath(); ctx.arc(-R * 0.04, 0, R * 0.3, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  ctx.restore();

  // Número nas costas
  if (s > 9 && !extras.semNumero) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${Math.round(R * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(String(j.num), x, y - R * 1.15);
    ctx.fillStyle = "#fff";
    ctx.fillText(String(j.num), x, y - R * 1.15);
    if (j.amarelos > 0 || j.expulso) {
      ctx.fillStyle = j.expulso ? "#ef4444" : "#facc15";
      ctx.fillRect(x + R * 0.55, y - R * 1.45, R * 0.35, R * 0.5);
    }
    ctx.restore();
  }
}

function desenharArbitro(ctx, r, x, y, s, cor = "#facc15") {
  const R = s * 1.15;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(x + R * 0.25, y + R * 0.3, R * 0.9, R * 0.65, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(r.ang);
  const passo = Math.sin(r.fase * 2.2) * R * 0.4;
  ctx.fillStyle = "#111827";
  ctx.beginPath(); ctx.ellipse(passo, -R * 0.26, R * 0.32, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-passo, R * 0.26, R * 0.32, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(-R * 0.15, -R * 0.2, R * 0.1, 0, 0, R * 0.8);
  g.addColorStop(0, clarear(cor, 0.4)); g.addColorStop(1, cor);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.48, R * 0.64, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e0b48a";
  ctx.beginPath(); ctx.arc(R * 0.05, 0, R * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1f1308";
  ctx.beginPath(); ctx.arc(-R * 0.04, 0, R * 0.28, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  ctx.restore();
}

function desenharBola(ctx, b, tx, ty, s) {
  const x = tx(b.x), y = ty(b.y);
  const r = Math.max(2.5, s * 0.3) * (1 + b.z * 0.07);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(x + b.z * s * 0.25, y + b.z * s * 0.15 + r * 0.3, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  const by = y - b.z * s * 0.5;
  const g = ctx.createRadialGradient(x - r * 0.3, by - r * 0.3, r * 0.1, x, by, r);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#d4d4d4");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1f2937";
  for (let k = 0; k < 3; k++) {
    const a = (b.giro || 0) + k * 2.1;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.45, by + Math.sin(a) * r * 0.45, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }
}

function clarear(hex, q) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(c + (255 - c) * q);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Cena ao vivo a partir do estado da partida
function cenaAoVivo(P) {
  return {
    jogadores: P.jogadores.map((j) => ({ ...j, quedaAng: j.caido > 0 ? j.quedaAng : null })),
    bola: P.bola, arbitro: P.arbitro, particulas: P.particulas
  };
}

// Cena de um quadro gravado
function cenaGravada(P, f) {
  return {
    jogadores: P.jogadores.map((j, i) => {
      const d = f.j[i];
      return { ...j, x: d[0], y: d[1], ang: d[2], quedaAng: d[3], fase: d[4], saiu: !!d[5], braco: d[6], lunge: d[7], caido: d[3] === null ? 0 : 1 };
    }),
    bola: { x: f.b[0], y: f.b[1], z: f.b[2], giro: f.b[3] },
    arbitro: { x: f.r[0], y: f.r[1], ang: f.r[2], fase: f.r[3] },
    particulas: []
  };
}

// ---------- Som ----------

const som = (() => {
  let ac = null, ouro = false, ruido = null;
  const pegar = () => {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return ac;
  };
  function tom(freq, dur, tipo = "sine", vol = 0.08, quando = 0) {
    const a = pegar(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = tipo; o.frequency.value = freq;
    const t0 = a.currentTime + quando;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur);
  }
  function apitoUm(quando, longo) {
    const a = pegar(); if (!a) return;
    const dur = longo ? 0.7 : 0.32;
    const t0 = a.currentTime + quando;
    const o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    o.type = "sine"; o.frequency.value = ouro ? 3400 : 2900;
    lfo.frequency.value = 38; lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
    g.gain.setValueAtTime(0.09, t0 + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); lfo.start(t0); o.stop(t0 + dur); lfo.stop(t0 + dur);
  }
  return {
    liberar() { pegar(); },
    setOuro(v) { ouro = v; },
    apito(n) { for (let i = 0; i < n; i++) apitoUm(i * 0.45, i === n - 1 && n > 1); },
    chute(f) { tom(120, 0.08, "triangle", 0.06 * f); },
    contato(f) { tom(90, 0.12, "sawtooth", 0.05 * f); },
    cartao() { tom(660, 0.12, "square", 0.04); tom(880, 0.16, "square", 0.04, 0.1); },
    moeda() { tom(988, 0.08, "square", 0.04); tom(1319, 0.18, "square", 0.04, 0.08); },
    torcida(f) {
      const a = pegar(); if (!a) return;
      if (!ruido) {
        ruido = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
        const d = ruido.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = a.createBufferSource(), filtro = a.createBiquadFilter(), g = a.createGain();
      src.buffer = ruido; filtro.type = "bandpass"; filtro.frequency.value = 900; filtro.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12 * f, a.currentTime + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.9);
      src.connect(filtro).connect(g).connect(a.destination);
      src.start(); src.stop(a.currentTime + 2);
    }
  };
})();
