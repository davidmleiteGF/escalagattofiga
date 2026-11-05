// Tipos que espelham as tabelas do Supabase (veja supabase/schema.sql).

export type Funcionario = {
  id: string;
  nome: string;
  funcao: string;
  telefone: string | null;
  cpf: string | null;
  ativo: boolean;
  /** Equipe fixa (turno) do funcionário; null = sem equipe definida. */
  equipe_turno_id: string | null;
};

export type Turno = {
  id: string;
  nome: string;
  hora_inicio: string; // "11:00:00"
  hora_fim: string; // "15:30:00"
  ordem: number;
};

export type Escala = {
  id: string;
  data: string; // "2026-11-20"
  turno_id: string;
  funcionario_id: string;
};

export type Regra = {
  id: string;
  dia_semana: number | null; // 0 = domingo ... 6 = sábado; null = todos os dias
  turno_id: string;
  funcao: string;
  minimo: number;
};

export type Configuracao = {
  chave: string;
  valor: string;
};

/** Horário de uma função dentro de um turno (configuracoes.horarios_funcao). */
export type HorarioFuncao = {
  turno_id: string;
  funcao: string | null; // null = todas as outras funções do turno
  entrada: string; // "08:00"
  saida: string; // "17:24" (pode passar da meia-noite, ex.: "00:54")
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
};

/** Marcação de ponto de um dia, no formato interno (veja docs/api-ponto.md). */
export type Marcacao = {
  cpf: string; // só dígitos
  data: string; // "2026-11-04"
  entrada: string | null; // "HH:MM"
  saida_intervalo: string | null;
  volta_intervalo: string | null;
  saida: string | null;
};

/** Resposta da rota /api/ponto (servidor) para a tela de conferência. */
export type RespostaPonto = {
  fonte: "api" | "exemplo";
  /** Motivo de ter usado os dados de exemplo (quando fonte = "exemplo"). */
  aviso?: string;
  marcacoes: Marcacao[];
};

export const FUNCOES_PADRAO = [
  "Pizzaiolo",
  "Cozinheiro",
  "Confeiteira",
  "Pia",
  "Garçom",
  "Bar",
  "Caixa",
  "Gerência",
];
