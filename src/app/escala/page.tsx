"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Configuracao, Escala, Funcionario, Regra, Turno } from "@/lib/tipos";
import {
  type Alerta,
  avisoFecharEAbrir,
  contarPorFuncao,
  lerConfigRegras,
  minimosDoTurno,
  verificarSemana,
} from "@/lib/regras";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  somarDias,
} from "@/lib/datas";

type CelulaAberta = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  // Escalas da semana + o domingo anterior e a segunda seguinte (para a regra de fechar e abrir).
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [configs, setConfigs] = useState<Configuracao[]>([]);
  const [carregando, setCarregando] = useState(() => variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [celula, setCelula] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const hoje = hojeISO();

  // Turnos, funcionários e regras: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) return;
      const db = supabase();
      const [t, f, r, c] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
        db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
        db.from("configuracoes").select("chave, valor"),
      ]);
      const falha = t.error ?? f.error ?? r.error ?? c.error;
      if (falha) {
        setErro(`Não foi possível carregar os dados: ${falha.message}`);
        return;
      }
      setTurnos(t.data ?? []);
      setFuncionarios(f.data ?? []);
      setRegras(r.data ?? []);
      setConfigs(c.data ?? []);
    }
    carregarBase();
  }, []);

  // Escalas da semana mostrada: recarregadas ao trocar de semana.
  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    let cancelado = false;
    async function carregarEscalas() {
      const { data, error } = await supabase()
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", somarDias(segunda, -1))
        .lte("data", somarDias(segunda, 7));
      if (cancelado) return;
      if (error) setErro(`Não foi possível carregar a escala: ${error.message}`);
      else setEscalas(data ?? []);
      setCarregando(false);
    }
    carregarEscalas();
    return () => {
      cancelado = true;
    };
  }, [segunda]);

  function irParaSemana(novaSegunda: string) {
    if (novaSegunda === segunda) return;
    setCarregando(true);
    setSegunda(novaSegunda);
  }

  const porId = new Map(funcionarios.map((f) => [f.id, f]));

  function escaladosNa(data: string, turnoId: string): Escala[] {
    return escalas.filter((e) => e.data === data && e.turno_id === turnoId);
  }

  async function alternar(funcionario: Funcionario) {
    if (!celula) return;
    const { data, turno } = celula;
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id,
    );
    setSalvandoId(funcionario.id);
    const db = supabase().from("escalas");
    if (existente) {
      const { error } = await db.delete().eq("id", existente.id);
      if (error) setErro(`Não foi possível tirar da escala: ${error.message}`);
      else setEscalas((atual) => atual.filter((e) => e.id !== existente.id));
    } else {
      const { data: nova, error } = await db
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível colocar na escala: ${error.message}`);
      else if (nova) setEscalas((atual) => [...atual, nova]);
    }
    setSalvandoId(null);
  }

  const config = useMemo(() => lerConfigRegras(configs), [configs]);
  const alertas = useMemo(
    () => verificarSemana({ dias, turnos, funcionarios, escalas, regras, config }),
    [dias, turnos, funcionarios, escalas, regras, config],
  );

  function alertasDaCelula(data: string, turnoId: string): Alerta[] {
    return alertas.filter((a) => a.celulas.some((c) => c.data === data && c.turnoId === turnoId));
  }

  function abrirCelula(data: string, turnoId: string) {
    const turno = turnos.find((t) => t.id === turnoId);
    if (turno) setCelula({ data, turno });
  }

  // Na janela de escolha: ativos + inativos que já estavam escalados nessa célula.
  const opcoes = celula
    ? funcionarios.filter(
        (f) =>
          f.ativo ||
          escaladosNa(celula.data, celula.turno.id).some((e) => e.funcionario_id === f.id),
      )
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {diaMes(dias[0])} a {diaMes(dias[6])}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button className="botao-secundario" onClick={() => irParaSemana(somarDias(segunda, -7))}>
            ◀ Anterior
          </button>
          <button className="botao-secundario" onClick={() => irParaSemana(somarDias(segunda, 7))}>
            Próxima ▶
          </button>
        </div>
        {segunda !== inicioDaSemana(hoje) && (
          <button className="botao w-full" onClick={() => irParaSemana(inicioDaSemana(hoje))}>
            Voltar para esta semana
          </button>
        )}
      </div>

      {erro && (
        <p className="cartao border-red-300 text-red-700" onClick={() => setErro(null)}>
          {erro}
        </p>
      )}

      {!carregando && turnos.length > 0 && (
        <section
          className={`cartao ${alertas.length ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}
        >
          {alertas.length === 0 ? (
            <p className="font-semibold text-green-800">✅ Nenhum alerta nesta semana</p>
          ) : (
            <details>
              <summary className="cursor-pointer list-none py-1 font-semibold text-red-800">
                ⚠️ {alertas.length} {alertas.length === 1 ? "alerta" : "alertas"} nesta semana
                <span className="block text-sm font-normal text-red-700">Toque para ver a lista</span>
              </summary>
              <ul className="mt-2 space-y-2">
                {alertas.map((a, i) => {
                  const alvo = a.celulas[0];
                  return (
                    <li key={i}>
                      {alvo ? (
                        <button
                          className="w-full rounded-xl border border-red-200 bg-white px-3 py-3 text-left text-red-800 active:scale-[0.98]"
                          onClick={() => abrirCelula(alvo.data, alvo.turnoId)}
                        >
                          {a.texto}
                        </button>
                      ) : (
                        <p className="rounded-xl border border-red-200 bg-white px-3 py-3 text-red-800">
                          {a.texto}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          <Link href="/regras" className="mt-2 block text-sm text-neutral-700 underline">
            Ver ou mudar as regras da casa
          </Link>
        </section>
      )}

      <p className="text-sm text-neutral-600">
        Toque num quadro para escolher quem trabalha. Arraste para o lado para ver todos os dias.
      </p>

      <div className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm ${carregando ? "opacity-60" : ""}`}>
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-white p-2 text-left">Turno</th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-[7.5rem] p-2 text-center ${d === hoje ? "bg-principal text-white" : ""}`}
                >
                  <span className="block">{DIAS_SEMANA[paraData(d).getDay()]}</span>
                  <span className="block font-normal">{diaMes(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id} className="border-t border-neutral-200">
                <th className="sticky left-0 z-[1] bg-white p-2 text-left align-top">
                  <span className="block text-base">{t.nome}</span>
                  <span className="block font-normal text-neutral-600">
                    {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const lista = escaladosNa(d, t.id);
                  const avisos = alertasDaCelula(d, t.id);
                  const comProblema = new Set(avisos.map((a) => a.funcionarioId).filter(Boolean));
                  return (
                    <td key={d} className="p-1 align-top">
                      <button
                        className={`min-h-24 w-full rounded-xl border p-2 text-left active:scale-[0.98] ${
                          avisos.length
                            ? "border-2 border-red-500 bg-red-50"
                            : d === hoje
                              ? "border-principal"
                              : "border-neutral-200"
                        } ${lista.length && !avisos.length ? "bg-neutral-50" : ""}`}
                        onClick={() => setCelula({ data: d, turno: t })}
                      >
                        {lista.length === 0 ? (
                          <span className="text-neutral-400">+ escolher</span>
                        ) : (
                          <ul className="space-y-1">
                            {lista.map((e) => (
                              <li
                                key={e.id}
                                className={`leading-tight ${comProblema.has(e.funcionario_id) ? "font-semibold text-red-700" : ""}`}
                              >
                                {porId.get(e.funcionario_id)?.nome ?? "?"}
                              </li>
                            ))}
                          </ul>
                        )}
                        {avisos.length > 0 && (
                          <ul className="mt-2 space-y-0.5 border-t border-red-200 pt-1 text-xs font-semibold text-red-700">
                            {avisos.map((a, i) => (
                              <li key={i}>⚠️ {a.curto}</li>
                            ))}
                          </ul>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {celula && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelula(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              {celula.turno.nome} · {DIAS_SEMANA[paraData(celula.data).getDay()]} {diaMes(celula.data)}
            </h2>
            <p className="mb-3 text-sm text-neutral-600">Marque quem trabalha. Salva na hora.</p>
            {(() => {
              const minimos = minimosDoTurno(regras, celula.turno.id, celula.data);
              if (!minimos.length) return null;
              const contagem = contarPorFuncao(escalas, porId, celula.data, celula.turno.id);
              return (
                <div className="mb-3 flex flex-wrap gap-2">
                  {minimos.map(({ funcao, minimo }) => {
                    const tem = contagem.get(funcao) ?? 0;
                    const ok = tem >= minimo;
                    return (
                      <span
                        key={funcao}
                        className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                          ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {funcao}: {tem} de {minimo}
                      </span>
                    );
                  })}
                </div>
              );
            })()}
            <ul className="space-y-2">
              {opcoes.map((f) => {
                const marcado = escalas.some(
                  (e) =>
                    e.data === celula.data &&
                    e.turno_id === celula.turno.id &&
                    e.funcionario_id === f.id,
                );
                const aviso = avisoFecharEAbrir({
                  turnos,
                  escalas,
                  config,
                  funcionarioId: f.id,
                  data: celula.data,
                  turnoId: celula.turno.id,
                });
                return (
                  <li key={f.id}>
                    <label
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
                        marcado ? "border-principal bg-neutral-50" : "border-neutral-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-6 w-6 accent-principal"
                        checked={marcado}
                        disabled={salvandoId !== null}
                        onChange={() => alternar(f)}
                      />
                      <span className="flex-1">
                        <span className="block font-semibold">{f.nome}</span>
                        <span className="block text-sm text-neutral-600">
                          {f.funcao}
                          {!f.ativo && " · inativo"}
                        </span>
                        {aviso && (
                          <span className="block text-sm font-semibold text-red-700">⚠️ {aviso}</span>
                        )}
                      </span>
                      {salvandoId === f.id && <span className="text-sm text-neutral-500">...</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <button className="botao mt-4 w-full" onClick={() => setCelula(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
