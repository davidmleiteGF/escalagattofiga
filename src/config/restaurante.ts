// Descrição do restaurante, do jeito que o dono contou.
// As regras que o sistema confere ficam no banco e são editadas na tela /regras;
// este arquivo é o registro de referência para as próximas entregas.

export const RESTAURANTE = {
  nome: "GattoFiga Pizza Bar",
  tipo: "Pizzaria",
  funcionamento:
    "Segunda fechado. Terça a quinta 12h–15h e 18h–23h; sexta 12h–15h e 18h–00h; " +
    "sábado 12h–16h e 18h–00h; domingo 12h–16h e 18h–23h.",
  turnos: [
    {
      nome: "Almoço",
      horarios: [
        { funcoes: "Cozinheiro, Pizzaiolo, Pia", entrada: "08:00", intervalo: "10:45–11:45", saida: "17:24" },
        { funcoes: "Garçom, Bar", entrada: "09:00", intervalo: "10:45–11:45", saida: "18:24" },
      ],
    },
    {
      nome: "Jantar",
      horarios: [{ funcoes: "todas", entrada: "15:30", intervalo: "16:45–17:45", saida: "00:54" }],
    },
  ],
  equipes: {
    Almoço: "3 cozinheiros, 1 pizzaiolo, (pia), 2 garçons, 1 bar",
    Jantar: "3 pizzaiolos, 1 confeiteira, 1 pia, 4 garçons, 1 bar",
  },
  funcoes: ["Pizzaiolo", "Cozinheiro", "Confeiteira", "Pia", "Garçom", "Bar"],
  minimos:
    "Jantar: 2 pizzaiolos, 3 garçons e 1 bar (sem bar, chamar freelancer). " +
    "Almoço: 2 cozinheiros e 1 garçom; domingo é pico, o ideal são 3 cozinheiros, mas o mínimo é 2.",
  // Funções em que a falta é coberta por freelancer (o alerta sugere chamar um).
  funcoesComFreelancer: ["Bar"] as string[],
  cargaHorariaSemanal: 42,
  folgasPorSemana: 2, // 5x2: segunda (casa fechada) + 1 dia
  podeFecharEAbrir: false,
  regrasExtras: [
    "Ninguém folga sexta nem sábado (dias de pico), em nenhuma equipe.",
    "Cada funcionário folga pelo menos 1 domingo por mês.",
    "Quem é da equipe do Almoço não trabalha no Jantar, e vice-versa.",
    "8h24 de trabalho por dia + 1h de intervalo.",
  ],
  corPrincipal: "#1E2E45",
  corSecundaria: "#F3EADB",
  temLogo: true,
};
