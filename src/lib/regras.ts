// Verificação das regras da casa sobre a escala da semana.
// Aqui só tem conta: nada de banco de dados. As regras vêm das tabelas
// `regras` (mínimo por turno e função) e `configuracoes` (folgas e fechar/abrir),
// que podem ser editadas na tela /regras.

import type { Configuracao, Escala, Funcionario, Regra, Turno } from "@/lib/tipos";
import { DIAS_SEMANA, diaMes, paraData, somarDias } from "@/lib/datas";

export type ConfigRegras = {
  folgasMinimas: number;
  bloquearFecharEAbrir: boolean;
};

export type Celula = { data: string; turnoId: string };

export type Alerta = {
  tipo: "minimo" | "folga" | "fechar-abrir";
  /** Texto completo, para o resumo no topo. */
  texto: string;
  /** Texto curto, para dentro do quadro da grade. */
  curto: string;
  /** Quadros da grade onde o alerta aparece (vazio = só no resumo). */
  celulas: Celula[];
  funcionarioId?: string;
};

export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_ABRIR = "bloquear_fechar_e_abrir";

export function lerConfigRegras(configs: Configuracao[]): ConfigRegras {
  const valor = (chave: string) => configs.find((c) => c.chave === chave)?.valor;
  const folgas = Number(valor(CHAVE_FOLGAS));
  return {
    folgasMinimas: Number.isFinite(folgas) && folgas > 0 ? Math.floor(folgas) : 0,
    bloquearFecharEAbrir: valor(CHAVE_FECHAR_ABRIR) === "true",
  };
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

function rotulo(data: string): string {
  return `${DIAS_SEMANA[paraData(data).getDay()]} ${diaMes(data)}`;
}

/**
 * Confere a semana e devolve a lista de alertas.
 * `escalas` deve incluir também o domingo anterior e a segunda seguinte,
 * para conferir quem fecha e abre na virada da semana.
 */
export function verificarSemana(entrada: {
  dias: string[]; // os 7 dias da semana (segunda a domingo)
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  regras: Regra[];
  config: ConfigRegras;
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas, regras, config } = entrada;
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const nome = (id: string) => porId.get(id)?.nome ?? "Funcionário";
  const alertas: Alerta[] = [];
  const naSemana = new Set(dias);

  // 1. Mínimo de pessoas por turno e função
  for (const turno of turnos) {
    for (const data of dias) {
      const contagem = contarPorFuncao(escalas, porId, data, turno.id);
      for (const { funcao, minimo } of minimosDoTurno(regras, turno.id, data)) {
        const falta = minimo - (contagem.get(funcao) ?? 0);
        if (falta <= 0) continue;
        alertas.push({
          tipo: "minimo",
          texto: `${turno.nome} de ${rotulo(data)}: falta ${falta} no ${funcao} (mínimo ${minimo})`,
          curto: `Falta ${falta} ${funcao}`,
          celulas: [{ data, turnoId: turno.id }],
        });
      }
    }
  }

  // 2. Folgas mínimas na semana (folga = dia sem nenhum turno)
  if (config.folgasMinimas > 0) {
    const diasTrabalhados = new Map<string, Set<string>>();
    for (const e of escalas) {
      if (!naSemana.has(e.data)) continue;
      if (!diasTrabalhados.has(e.funcionario_id)) diasTrabalhados.set(e.funcionario_id, new Set());
      diasTrabalhados.get(e.funcionario_id)!.add(e.data);
    }
    for (const [id, trabalhados] of diasTrabalhados) {
      const folgas = dias.length - trabalhados.size;
      if (folgas >= config.folgasMinimas) continue;
      alertas.push({
        tipo: "folga",
        texto:
          folgas === 0
            ? `${nome(id)} está sem folga na semana (mínimo ${config.folgasMinimas})`
            : `${nome(id)} tem só ${folgas} folga(s) na semana (mínimo ${config.folgasMinimas})`,
        curto: "Sem folga",
        celulas: [],
        funcionarioId: id,
      });
    }
  }

  // 3. Ninguém fecha um dia e abre o dia seguinte
  const extremos = config.bloquearFecharEAbrir ? turnosDeAbrirEFechar(turnos) : null;
  if (extremos) {
    // Do domingo anterior até o domingo da semana (o par é "dia" e "dia seguinte").
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
          curto: `${nome(e.funcionario_id).split(" ")[0]} fecha e abre`,
          celulas,
          funcionarioId: e.funcionario_id,
        });
      }
    }
  }

  return alertas;
}

/**
 * Aviso para a janela de escolha: colocar esta pessoa neste quadro
 * faria ela fechar e abrir? Devolve o texto do aviso ou null.
 */
export function avisoFecharEAbrir(entrada: {
  turnos: Turno[];
  escalas: Escala[];
  config: ConfigRegras;
  funcionarioId: string;
  data: string;
  turnoId: string;
}): string | null {
  const { turnos, escalas, config, funcionarioId, data, turnoId } = entrada;
  const extremos = config.bloquearFecharEAbrir ? turnosDeAbrirEFechar(turnos) : null;
  if (!extremos) return null;
  const esta = (d: string, t: string) =>
    escalas.some((e) => e.data === d && e.turno_id === t && e.funcionario_id === funcionarioId);
  if (turnoId === extremos.abre.id && esta(somarDias(data, -1), extremos.fecha.id)) {
    return `Fecha o dia anterior (${extremos.fecha.nome})`;
  }
  if (turnoId === extremos.fecha.id && esta(somarDias(data, 1), extremos.abre.id)) {
    return `Abre o dia seguinte (${extremos.abre.nome})`;
  }
  return null;
}
