// Dados do jogo: ligas da carreira, times e melhorias da loja.
// Os times são inventados (inspirados em cada região/competição).

const LIGAS = [
  {
    id: "d", nome: "Série D", sub: "Brasileirão", cor: "#8a9aa8",
    moedas: 10, precisa: 2, var: false,
    velocidade: 0.92, janela: 3.4, incidentes: 7, vistaBase: 27,
    pesos: { limpa: 3, falta: 4, imprudente: 2, violenta: 0.6, simulacao: 1 },
    times: [
      ["Ferroviário do Norte", "#c62828", "#ffffff"], ["Atlético Sertanejo", "#1e3a8a", "#facc15"],
      ["União Ribeirinha", "#0f766e", "#ffffff"], ["EC Cerrado", "#f59e0b", "#1f2937"],
      ["Operário Serrano", "#111827", "#f9fafb"], ["Tupi do Vale", "#16a34a", "#fefce8"]
    ]
  },
  {
    id: "c", nome: "Série C", sub: "Brasileirão", cor: "#b08d57",
    moedas: 15, precisa: 3, var: false,
    velocidade: 0.97, janela: 3.1, incidentes: 8, vistaBase: 27.5,
    pesos: { limpa: 3, falta: 4, imprudente: 2.2, violenta: 0.7, simulacao: 1.3 },
    times: [
      ["Náutico Praiano", "#dc2626", "#fafafa"], ["Grêmio Missioneiro", "#0369a1", "#111827"],
      ["Botafogo do Agreste", "#171717", "#fafafa"], ["Ypiranga Paulista", "#7c3aed", "#fde68a"],
      ["Paysandu Amazônico", "#38bdf8", "#ffffff"], ["Remo Ribeirão", "#1d4ed8", "#ffffff"]
    ]
  },
  {
    id: "b", nome: "Série B", sub: "Brasileirão", cor: "#9ca3af",
    moedas: 22, precisa: 3, var: false,
    velocidade: 1.0, janela: 2.9, incidentes: 8, vistaBase: 28,
    pesos: { limpa: 3, falta: 3.6, imprudente: 2.4, violenta: 0.8, simulacao: 1.5 },
    times: [
      ["Coritiba Serrano", "#15803d", "#ffffff"], ["Sport Litorâneo", "#b91c1c", "#111111"],
      ["Goiás Central", "#166534", "#f8fafc"], ["Ponte Campineira", "#111827", "#ffffff"],
      ["Avaí Ilhéu", "#1e40af", "#f8fafc"], ["Criciúma Mineiro", "#facc15", "#111827"]
    ]
  },
  {
    id: "a", nome: "Série A", sub: "Brasileirão", cor: "#22c55e",
    moedas: 32, precisa: 3, var: true,
    velocidade: 1.04, janela: 2.7, incidentes: 9, vistaBase: 28.5,
    pesos: { limpa: 3, falta: 3.4, imprudente: 2.6, violenta: 0.9, simulacao: 1.7 },
    times: [
      ["Rubro-Negro Carioca", "#b91c1c", "#111111"], ["Alviverde Paulista", "#15803d", "#ffffff"],
      ["Tricolor Gaúcho", "#0ea5e9", "#111827"], ["Galo Mineiro", "#111111", "#ffffff"],
      ["Timão da Capital", "#f8fafc", "#111111"], ["Raposa Celeste", "#1d4ed8", "#ffffff"]
    ]
  },
  {
    id: "lib", nome: "Libertadores", sub: "Conmebol", cor: "#eab308",
    moedas: 45, precisa: 3, var: true,
    velocidade: 1.08, janela: 2.5, incidentes: 9, vistaBase: 29,
    pesos: { limpa: 3, falta: 3.2, imprudente: 2.8, violenta: 1, simulacao: 2 },
    times: [
      ["Xeneize Portenho", "#1e3a8a", "#facc15"], ["Millonario de Núñez", "#f8fafc", "#dc2626"],
      ["Peñarol Oriental", "#facc15", "#111111"], ["Colo-Colo Andino", "#f8fafc", "#111111"],
      ["Rubro-Negro Carioca", "#b91c1c", "#111111"], ["Alviverde Paulista", "#15803d", "#ffffff"]
    ]
  },
  {
    id: "ucl", nome: "Champions League", sub: "Europa", cor: "#3b82f6",
    moedas: 60, precisa: 3, var: true,
    velocidade: 1.12, janela: 2.3, incidentes: 10, vistaBase: 29.5,
    pesos: { limpa: 3.2, falta: 3, imprudente: 2.8, violenta: 1, simulacao: 2.2 },
    times: [
      ["Real Castela", "#f8fafc", "#a16207"], ["Blaugrana Catalão", "#7f1d1d", "#1e3a8a"],
      ["Bávaros de Munique", "#dc2626", "#ffffff"], ["Citizens do Norte", "#7dd3fc", "#0f172a"],
      ["Diabos Vermelhos", "#b91c1c", "#ffffff"], ["Nerazzurri Lombardo", "#1e3a8a", "#111111"]
    ]
  },
  {
    id: "copa", nome: "Copa do Mundo", sub: "A grande final", cor: "#f59e0b",
    moedas: 100, precisa: 1, var: true,
    velocidade: 1.15, janela: 2.2, incidentes: 10, vistaBase: 30,
    pesos: { limpa: 3.2, falta: 3, imprudente: 2.8, violenta: 1.1, simulacao: 2.4 },
    times: [
      ["Brasil", "#facc15", "#15803d"], ["Argentina", "#7dd3fc", "#ffffff"],
      ["França", "#1e3a8a", "#ffffff"], ["Alemanha", "#f8fafc", "#111111"],
      ["Espanha", "#b91c1c", "#facc15"], ["Inglaterra", "#f8fafc", "#1e3a8a"]
    ]
  }
];

const MELHORIAS = [
  { id: "replay", nome: "Replay", icone: "🔁", preco: 80,
    desc: "Assista ao lance de novo antes de decidir." },
  { id: "lenta", nome: "Câmera lenta", icone: "🐢", preco: 150, requer: "replay",
    desc: "Replay em câmera lenta para ver o contato." },
  { id: "zoom", nome: "Ângulo aproximado", icone: "🔍", preco: 220, requer: "replay",
    desc: "Câmera de perto no replay, focada no lance." },
  { id: "tatica", nome: "Câmera tática", icone: "🎯", preco: 380, requer: "zoom",
    desc: "Marca no replay onde houve contato e toque na bola." },
  { id: "linhas", nome: "Linhas de impedimento", icone: "📏", preco: 300, requer: "replay",
    desc: "Desenha a linha do impedimento no momento do passe." },
  { id: "bandeira", nome: "Bandeirinha atento", icone: "🚩", preco: 180,
    desc: "O assistente levanta a bandeira nos impedimentos (acerta quase sempre)." },
  { id: "fisico1", nome: "Preparo físico I", icone: "🏃", preco: 120,
    desc: "Você acompanha a jogada de mais perto: câmera mais próxima." },
  { id: "fisico2", nome: "Preparo físico II", icone: "⚡", preco: 320, requer: "fisico1",
    desc: "Ainda mais perto dos lances." },
  { id: "cabine", nome: "Cabine do VAR", icone: "📺", preco: 450, requer: "replay",
    desc: "Nas ligas sem VAR, você pode revisar gols e lances na área no monitor." },
  { id: "equipevar", nome: "Equipe de VAR experiente", icone: "🎧", preco: 400,
    desc: "O VAR te chama para revisar mais vezes quando você erra um lance importante." },
  { id: "apito_ouro", nome: "Apito de ouro", icone: "🥇", preco: 250, cosmetico: true,
    desc: "Som de apito especial e brilho dourado no botão." },
  { id: "uniforme_rosa", nome: "Uniforme rosa", icone: "🩷", preco: 120, cosmetico: true,
    desc: "Troca a cor do seu uniforme de árbitro." },
  { id: "uniforme_verde", nome: "Uniforme verde-limão", icone: "💚", preco: 120, cosmetico: true,
    desc: "Troca a cor do seu uniforme de árbitro." }
];

// O que o árbitro deveria marcar em cada tipo de lance
const VERDADES = {
  limpa:      { apitar: false, tipo: "nada", cartao: "nenhum", nome: "Desarme limpo (bola primeiro)" },
  falta:      { apitar: true, tipo: "falta", cartao: "nenhum", nome: "Falta comum" },
  imprudente: { apitar: true, tipo: "falta", cartao: "amarelo", nome: "Falta imprudente (por trás / atrasada)" },
  violenta:   { apitar: true, tipo: "falta", cartao: "vermelho", nome: "Entrada violenta" },
  dogso:      { apitar: true, tipo: "falta", cartao: "vermelho", nome: "Falta que impediu chance clara de gol" },
  simulacao:  { apitar: true, tipo: "simulacao", cartao: "amarelo", nome: "Simulação (se jogou sem contato)" }
};
