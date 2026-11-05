// Conferência do dia: compara a escala planejada com as marcações de ponto.
// Só conta, sem banco de dados e sem API (quem busca os dados é a tela).

import type { Escala, Funcionario, Marcacao, Turno } from "@/lib/tipos";
import { horaParaMinutos } from "@/lib/datas";
import { type ConfigRegras, horarioPlanejado } from "@/lib/regras";

export type Situacao =
  | { tipo: "no-horario" }
  | { tipo: "atrasado"; minutos: number }
  | { tipo: "faltou" }
  | { tipo: "hora-extra"; minutos: number }
  | { tipo: "sem-saida" }
  | { tipo: "sem-cpf" };

export type LinhaConferencia = {
  funcionario: Funcionario;
  turnos: string; // "Almoço" ou "Almoço + Jantar"
  planejado: { entrada: string; saida: string };
  real: { entrada: string | null; saida: string | null } | null;
  situacoes: Situacao[];
};

export type NaoEscalado = {
  cpf: string;
  nome: string; // nome do cadastro, ou "CPF não cadastrado"
  funcao: string | null;
  entrada: string | null;
  saida: string | null;
};

export type ResultadoConferencia = {
  linhas: LinhaConferencia[];
  naoEscalados: NaoEscalado[];
  resumo: { atrasos: number; faltas: number; horasExtras: number };
};

const DIA = 24 * 60;

export function conferirDia(entrada: {
  data: string;
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[]; // só as do dia
  marcacoes: Marcacao[]; // só as do dia
  config: ConfigRegras;
}): ResultadoConferencia {
  const { data, turnos, funcionarios, config } = entrada;
  const escalas = entrada.escalas.filter((e) => e.data === data);
  const marcacoes = entrada.marcacoes.filter((m) => m.data === data);
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const porCpf = new Map(funcionarios.filter((f) => f.cpf).map((f) => [f.cpf!, f]));
  const marcacaoDoCpf = new Map(marcacoes.map((m) => [m.cpf, m]));
  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));

  // Agrupa por funcionário (se estiver em dois turnos, vale do começo do primeiro ao fim do último).
  const turnosDaPessoa = new Map<string, Turno[]>();
  for (const e of escalas) {
    const turno = turnoPorId.get(e.turno_id);
    if (!turno || !porId.has(e.funcionario_id)) continue;
    turnosDaPessoa.set(e.funcionario_id, [...(turnosDaPessoa.get(e.funcionario_id) ?? []), turno]);
  }

  const linhas: LinhaConferencia[] = [];
  const cpfsEscalados = new Set<string>();

  for (const [id, lista] of turnosDaPessoa) {
    const funcionario = porId.get(id)!;
    const ordenados = [...lista].sort((a, b) => a.ordem - b.ordem);
    const primeiro = horarioPlanejado(config, ordenados[0], funcionario.funcao);
    const ultimo = horarioPlanejado(config, ordenados[ordenados.length - 1], funcionario.funcao);
    const planejado = { entrada: primeiro.entrada, saida: ultimo.saida };
    const turnosTexto = ordenados.map((t) => t.nome).join(" + ");

    if (!funcionario.cpf) {
      linhas.push({ funcionario, turnos: turnosTexto, planejado, real: null, situacoes: [{ tipo: "sem-cpf" }] });
      continue;
    }
    cpfsEscalados.add(funcionario.cpf);
    const m = marcacaoDoCpf.get(funcionario.cpf);
    if (!m || !m.entrada) {
      linhas.push({ funcionario, turnos: turnosTexto, planejado, real: null, situacoes: [{ tipo: "faltou" }] });
      continue;
    }

    const situacoes: Situacao[] = [];
    const inicioPlan = horaParaMinutos(planejado.entrada);
    let fimPlan = horaParaMinutos(planejado.saida);
    if (fimPlan <= inicioPlan) fimPlan += DIA; // turno passa da meia-noite

    let atraso = horaParaMinutos(m.entrada) - inicioPlan;
    if (atraso < -DIA / 2) atraso += DIA;
    if (atraso > config.toleranciaAtraso) situacoes.push({ tipo: "atrasado", minutos: atraso });

    if (m.saida) {
      let saidaReal = horaParaMinutos(m.saida);
      if (saidaReal < horaParaMinutos(m.entrada)) saidaReal += DIA; // saiu depois da meia-noite
      const extra = saidaReal - fimPlan;
      if (extra > config.horaExtra) situacoes.push({ tipo: "hora-extra", minutos: extra });
    } else {
      situacoes.push({ tipo: "sem-saida" });
    }
    if (!situacoes.some((s) => s.tipo === "atrasado")) situacoes.unshift({ tipo: "no-horario" });

    linhas.push({
      funcionario,
      turnos: turnosTexto,
      planejado,
      real: { entrada: m.entrada, saida: m.saida },
      situacoes,
    });
  }

  linhas.sort(
    (a, b) =>
      a.planejado.entrada.localeCompare(b.planejado.entrada) ||
      a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR"),
  );

  const naoEscalados: NaoEscalado[] = marcacoes
    .filter((m) => !cpfsEscalados.has(m.cpf))
    .map((m) => {
      const f = porCpf.get(m.cpf);
      return {
        cpf: m.cpf,
        nome: f?.nome ?? "CPF não cadastrado",
        funcao: f?.funcao ?? null,
        entrada: m.entrada,
        saida: m.saida,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const conta = (tipo: Situacao["tipo"]) =>
    linhas.filter((l) => l.situacoes.some((s) => s.tipo === tipo)).length;

  return {
    linhas,
    naoEscalados,
    resumo: { atrasos: conta("atrasado"), faltas: conta("faltou"), horasExtras: conta("hora-extra") },
  };
}

/** 75 -> "1h15"; 12 -> "12 min" */
export function minutosEmTexto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
}
