// Verificação das regras da casa sobre a escala da semana.
// Aqui só tem conta: nada de banco de dados. As regras vêm das tabelas
// `regras` (mínimo por turno e função) e `configuracoes` (folgas, dias fechados,
// picos, horários...), que podem ser editadas na tela /regras.

import type { Configuracao, Escala, Funcionario, HorarioFuncao, Regra, Turno } from "@/lib/tipos";
import { DIAS_SEMANA, diaMes, horaCurta, paraData, paraISO, somarDias } from "@/lib/datas";
import { RESTAURANTE } from "@/config/restaurante";

export type ConfigRegras = {
  folgasMinimas: number;
  bloquearFecharEAbrir: boolean;
  diasFechados: number[]; // 0 = domingo ... 6 = sábado
  diasSemFolga: number[];
  domingosFolgaMes: number;
  diasPico: Record<string, number[]>; // turno_id -> dias da semana
  horarios: HorarioFuncao[];
  toleranciaAtraso: number; // minutos
  horaExtra: number; // minutos
  cargaSemanal: number; // horas
};

export type Celula = { data: string; turnoId: string };

export type Alerta = {
  tipo: "minimo" | "folga" | "fechar-abrir" | "sem-folga-dia" | "domingo" | "equipe" | "fechado";
  /** Texto completo, para o resumo no topo. */
  texto: string;
  /** Texto curto, para dentro do quadro da grade. */
  curto: string;
  /** Quadros da grade onde o alerta aparece (vazio = só no resumo). */
  celulas: Celula[];
  funcionarioId?: string;
};

/** Turno que cumpre o mínimo, mas sem ninguém de reserva em alguma função. */
export type Fragilidade = {
  data: string;
  turnoId: string;
  texto: string;
  curto: string;
  pico: boolean;
};

export const CHAVES = {
  folgas: "folgas_minimas_semana",
  fecharAbrir: "bloquear_fechar_e_abrir",
  diasFechados: "dias_fechados",
  diasSemFolga: "dias_sem_folga",
  domingosFolgaMes: "domingos_folga_mes",
  diasPico: "dias_pico",
  horarios: "horarios_funcao",
  tolerancia: "tolerancia_atraso_minutos",
  horaExtra: "hora_extra_minutos",
  carga: "carga_horaria_semanal",
} as const;

function numero(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return valor !== undefined && valor !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : padrao;
}

function listaDias(valor: string | undefined): number[] {
  if (!valor) return [];
  return valor
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function json<T>(valor: string | undefined, padrao: T): T {
  if (!valor) return padrao;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return padrao;
  }
}

export function lerConfigRegras(configs: Configuracao[]): ConfigRegras {
  const valor = (chave: string) => configs.find((c) => c.chave === chave)?.valor;
  return {
    folgasMinimas: numero(valor(CHAVES.folgas), 0),
    bloquearFecharEAbrir: valor(CHAVES.fecharAbrir) === "true",
    diasFechados: listaDias(valor(CHAVES.diasFechados)),
    diasSemFolga: listaDias(valor(CHAVES.diasSemFolga)),
    domingosFolgaMes: numero(valor(CHAVES.domingosFolgaMes), 0),
    diasPico: json<Record<string, number[]>>(valor(CHAVES.diasPico), {}),
    horarios: json<HorarioFuncao[]>(valor(CHAVES.horarios), []),
    toleranciaAtraso: numero(valor(CHAVES.tolerancia), 10),
    horaExtra: numero(valor(CHAVES.horaExtra), 30),
    cargaSemanal: numero(valor(CHAVES.carga), 0),
  };
}

export function diaFechado(config: ConfigRegras, data: string): boolean {
  return config.diasFechados.includes(paraData(data).getDay());
}

export function ehPico(config: ConfigRegras, turnoId: string, data: string): boolean {
  return (config.diasPico[turnoId] ?? []).includes(paraData(data).getDay());
}

/** Horário planejado de uma função num turno: o da função, senão o geral do turno. */
export function horarioPlanejado(
  config: ConfigRegras,
  turno: Turno,
  funcao: string,
): { entrada: string; saida: string; intervalo_inicio: string | null; intervalo_fim: string | null } {
  const doTurno = config.horarios.filter((h) => h.turno_id === turno.id);
  const h = doTurno.find((x) => x.funcao === funcao) ?? doTurno.find((x) => !x.funcao);
  if (h) return h;
  return {
    entrada: horaCurta(turno.hora_inicio),
    saida: horaCurta(turno.hora_fim),
    intervalo_inicio: null,
    intervalo_fim: null,
  };
}

/** Lista de dias da semana em texto: [5, 6] -> "sexta e sábado". */
export function nomesDias(dias: number[]): string {
  const nomes = [...dias]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // segunda primeiro
    .map((d) => DIAS_SEMANA[d].toLowerCase());
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Mínimos que valem para um turno num dia. Uma regra de um dia específico
 * (ex.: sexta) vale no lugar da regra de "todos os dias" da mesma função.
 */
export function minimosDoTurno(
  regras: Regra[],
  turnoId: string,
  data: string,
): { funcao: string; minimo: number }[] {
  const diaSemana = paraData(data).getDay();
  const doTurno = regras.filter((r) => r.turno_id === turnoId);
  const porFuncao = new Map<string, number>();
  for (const r of doTurno.filter((r) => r.dia_semana === null)) porFuncao.set(r.funcao, r.minimo);
  for (const r of doTurno.filter((r) => r.dia_semana === diaSemana)) porFuncao.set(r.funcao, r.minimo);
  return [...porFuncao]
    .filter(([, minimo]) => minimo > 0)
    .map(([funcao, minimo]) => ({ funcao, minimo }));
}

/** Quantos escalados de cada função estão num quadro. */
export function contarPorFuncao(
  escalas: Escala[],
  funcionarios: Map<string, Funcionario>,
  data: string,
  turnoId: string,
): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const e of escalas) {
    if (e.data !== data || e.turno_id !== turnoId) continue;
    const funcao = funcionarios.get(e.funcionario_id)?.funcao;
    if (funcao) contagem.set(funcao, (contagem.get(funcao) ?? 0) + 1);
  }
  return contagem;
}

/** Primeiro turno do dia (abre) e último (fecha), pela ordem cadastrada. */
export function turnosDeAbrirEFechar(turnos: Turno[]): { abre: Turno; fecha: Turno } | null {
  if (turnos.length < 2) return null;
  const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
  return { abre: ordenados[0], fecha: ordenados[ordenados.length - 1] };
}

/** Todos os domingos do mês da data. */
export function domingosDoMes(data: string): string[] {
  const d = paraData(data);
  const dia = new Date(d.getFullYear(), d.getMonth(), 1);
  const domingos: string[] = [];
  while (dia.getMonth() === d.getMonth()) {
    if (dia.getDay() === 0) domingos.push(paraISO(dia));
    dia.setDate(dia.getDate() + 1);
  }
  return domingos;
}

/** Período de escalas que a tela precisa carregar para conferir a semana. */
export function periodoParaConferir(segunda: string): { inicio: string; fim: string } {
  const domingos = domingosDoMes(somarDias(segunda, 6));
  const inicio = [somarDias(segunda, -1), domingos[0]].sort()[0];
  const fim = [somarDias(segunda, 7), domingos[domingos.length - 1]].sort()[1];
  return { inicio, fim };
}

function rotulo(data: string): string {
  return `${DIAS_SEMANA[paraData(data).getDay()]} ${diaMes(data)}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Confere a semana e devolve alertas (vermelho) e turnos fragilizados (amarelo).
 * `escalas` deve cobrir o período de `periodoParaConferir(segunda)`.
 */
export function verificarSemana(entrada: {
  dias: string[]; // os 7 dias da semana (segunda a domingo)
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  regras: Regra[];
  config: ConfigRegras;
}): { alertas: Alerta[]; fragilizados: Fragilidade[] } {
  const { dias, turnos, funcionarios, escalas, regras, config } = entrada;
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const nome = (id: string) => porId.get(id)?.nome ?? "Funcionário";
  const primeiroNome = (id: string) => nome(id).split(" ")[0];
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "";
  const alertas: Alerta[] = [];
  const fragilizados: Fragilidade[] = [];
  const naSemana = new Set(dias);
  const daSemana = escalas.filter((e) => naSemana.has(e.data));

  // Pessoas conferidas nas regras individuais: ativos com equipe + quem está escalado na semana.
  const pessoas = new Set<string>([
    ...funcionarios.filter((f) => f.ativo && f.equipe_turno_id).map((f) => f.id),
    ...daSemana.map((e) => e.funcionario_id),
  ]);
  const diasTrabalhados = new Map<string, Set<string>>();
  for (const e of daSemana) {
    if (!diasTrabalhados.has(e.funcionario_id)) diasTrabalhados.set(e.funcionario_id, new Set());
    diasTrabalhados.get(e.funcionario_id)!.add(e.data);
  }
  const trabalhou = (id: string, data: string) => diasTrabalhados.get(id)?.has(data) ?? false;

  for (const turno of turnos) {
    for (const data of dias) {
      // Dia fechado: não cobra mínimo; avisa se alguém foi escalado.
      if (diaFechado(config, data)) {
        const ali = daSemana.filter((e) => e.data === data && e.turno_id === turno.id);
        if (ali.length) {
          alertas.push({
            tipo: "fechado",
            texto: `${turno.nome} de ${rotulo(data)}: a casa está fechada, mas há ${ali.length} escalado(s)`,
            curto: "Casa fechada",
            celulas: [{ data, turnoId: turno.id }],
          });
        }
        continue;
      }

      // 1. Mínimo de pessoas por turno e função
      const contagem = contarPorFuncao(escalas, porId, data, turno.id);
      const minimos = minimosDoTurno(regras, turno.id, data);
      let faltou = false;
      const noLimite: string[] = [];
      for (const { funcao, minimo } of minimos) {
        const tem = contagem.get(funcao) ?? 0;
        const falta = minimo - tem;
        if (falta > 0) {
          faltou = true;
          const freela = RESTAURANTE.funcoesComFreelancer.includes(funcao) ? " · chamar freelancer" : "";
          alertas.push({
            tipo: "minimo",
            texto: `${turno.nome} de ${rotulo(data)}: falta ${falta} ${funcao} (mínimo ${minimo})${freela}`,
            curto: `Falta ${falta} ${funcao}${freela}`,
            celulas: [{ data, turnoId: turno.id }],
          });
        } else if (tem === minimo) {
          noLimite.push(`${funcao} ${tem}/${minimo}`);
        }
      }

      // Fragilizado: mínimo cumprido, mas sem reserva em alguma função.
      if (!faltou && noLimite.length) {
        const pico = ehPico(config, turno.id, data);
        fragilizados.push({
          data,
          turnoId: turno.id,
          pico,
          texto: `${turno.nome} de ${rotulo(data)}${pico ? " (pico)" : ""}: no limite em ${noLimite.join(", ")}. Se alguém faltar, fica descoberto.`,
          curto: `No limite: ${noLimite.join(", ")}`,
        });
      }
    }
  }

  // 2. Equipe certa: quem é do Almoço não trabalha no Jantar, e vice-versa.
  for (const e of daSemana) {
    const equipe = porId.get(e.funcionario_id)?.equipe_turno_id;
    if (!equipe || equipe === e.turno_id) continue;
    alertas.push({
      tipo: "equipe",
      texto: `${nome(e.funcionario_id)} é da equipe do ${nomeTurno(equipe)}, mas está no ${nomeTurno(e.turno_id)} de ${rotulo(e.data)}`,
      curto: `${primeiroNome(e.funcionario_id)}: outra equipe`,
      celulas: [{ data: e.data, turnoId: e.turno_id }],
      funcionarioId: e.funcionario_id,
    });
  }

  // 3. Folgas mínimas na semana (folga = dia sem nenhum turno; dia fechado conta como folga)
  if (config.folgasMinimas > 0) {
    for (const id of pessoas) {
      const folgas = dias.length - (diasTrabalhados.get(id)?.size ?? 0);
      if (folgas >= config.folgasMinimas) continue;
      alertas.push({
        tipo: "folga",
        texto: `${nome(id)} tem ${folgas} folga(s) na semana (mínimo ${config.folgasMinimas})`,
        curto: "Poucas folgas",
        celulas: [],
        funcionarioId: id,
      });
    }
  }

  // 4. Dias em que ninguém folga (ex.: sexta e sábado)
  const diasObrigatorios = dias.filter(
    (d) => config.diasSemFolga.includes(paraData(d).getDay()) && !diaFechado(config, d),
  );
  if (diasObrigatorios.length) {
    for (const id of pessoas) {
      const folgou = diasObrigatorios.filter((d) => !trabalhou(id, d));
      if (!folgou.length) continue;
      alertas.push({
        tipo: "sem-folga-dia",
        texto: `${nome(id)} está de folga em ${folgou.map(rotulo).join(" e ")} (não há folga ${nomesDias(config.diasSemFolga)})`,
        curto: "Folga em dia proibido",
        celulas: [],
        funcionarioId: id,
      });
    }
  }

  // 5. Domingos de folga no mês (mês do domingo desta semana)
  if (config.domingosFolgaMes > 0) {
    const domingoDaSemana = dias[6];
    const domingos = domingosDoMes(domingoDaSemana);
    const mes = MESES[paraData(domingoDaSemana).getMonth()];
    for (const id of pessoas) {
      const trabalhados = domingos.filter((d) =>
        escalas.some((e) => e.data === d && e.funcionario_id === id),
      ).length;
      const folgas = domingos.length - trabalhados;
      if (folgas >= config.domingosFolgaMes) continue;
      alertas.push({
        tipo: "domingo",
        texto: `${nome(id)} trabalha ${trabalhados} de ${domingos.length} domingos de ${mes}: precisa folgar pelo menos ${config.domingosFolgaMes} domingo(s) no mês`,
        curto: "Sem domingo de folga",
        celulas: [],
        funcionarioId: id,
      });
    }
  }

  // 6. Ninguém fecha um dia e abre o dia seguinte
  const extremos = config.bloquearFecharEAbrir ? turnosDeAbrirEFechar(turnos) : null;
  if (extremos) {
    for (const fechaEm of [somarDias(dias[0], -1), ...dias]) {
      const abreEm = somarDias(fechaEm, 1);
      const fecharam = escalas.filter((e) => e.data === fechaEm && e.turno_id === extremos.fecha.id);
      for (const e of fecharam) {
        const abriu = escalas.some(
          (x) =>
            x.data === abreEm &&
            x.turno_id === extremos.abre.id &&
            x.funcionario_id === e.funcionario_id,
        );
        if (!abriu) continue;
        const celulas = [
          { data: fechaEm, turnoId: extremos.fecha.id },
          { data: abreEm, turnoId: extremos.abre.id },
        ].filter((c) => naSemana.has(c.data));
        alertas.push({
          tipo: "fechar-abrir",
          texto: `${nome(e.funcionario_id)} fecha ${rotulo(fechaEm)} (${extremos.fecha.nome}) e abre ${rotulo(abreEm)} (${extremos.abre.nome})`,
          curto: `${primeiroNome(e.funcionario_id)} fecha e abre`,
          celulas,
          funcionarioId: e.funcionario_id,
        });
      }
    }
  }

  return { alertas, fragilizados };
}

/**
 * Aviso para a janela de escolha: colocar esta pessoa neste quadro
 * fere alguma regra individual? Devolve o texto do aviso ou null.
 */
export function avisoAoEscalar(entrada: {
  turnos: Turno[];
  escalas: Escala[];
  config: ConfigRegras;
  funcionario: Funcionario;
  data: string;
  turnoId: string;
}): string | null {
  const { turnos, escalas, config, funcionario, data, turnoId } = entrada;
  if (funcionario.equipe_turno_id && funcionario.equipe_turno_id !== turnoId) {
    const equipe = turnos.find((t) => t.id === funcionario.equipe_turno_id)?.nome;
    return `É da equipe do ${equipe}`;
  }
  const extremos = config.bloquearFecharEAbrir ? turnosDeAbrirEFechar(turnos) : null;
  if (!extremos) return null;
  const esta = (d: string, t: string) =>
    escalas.some((e) => e.data === d && e.turno_id === t && e.funcionario_id === funcionario.id);
  if (turnoId === extremos.abre.id && esta(somarDias(data, -1), extremos.fecha.id)) {
    return `Fecha o dia anterior (${extremos.fecha.nome})`;
  }
  if (turnoId === extremos.fecha.id && esta(somarDias(data, 1), extremos.abre.id)) {
    return `Abre o dia seguinte (${extremos.abre.nome})`;
  }
  return null;
}
