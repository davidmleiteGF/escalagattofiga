"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Configuracao, Escala, Funcionario, RespostaPonto, Turno } from "@/lib/tipos";
import { DIAS_SEMANA, diaMes, hojeISO, paraData, somarDias } from "@/lib/datas";
import { diaFechado, lerConfigRegras } from "@/lib/regras";
import { conferirDia, minutosEmTexto, type Situacao } from "@/lib/conferencia";

type Dados = {
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  configs: Configuracao[];
  ponto: RespostaPonto | null;
  erroPonto: string | null;
};

function Etiqueta({ s }: { s: Situacao }) {
  const estilos: Record<Situacao["tipo"], string> = {
    "no-horario": "bg-green-100 text-green-800",
    atrasado: "bg-amber-100 text-amber-900",
    faltou: "bg-red-100 text-red-800",
    "hora-extra": "bg-blue-100 text-blue-900",
    "sem-saida": "bg-neutral-200 text-neutral-700",
    "sem-cpf": "bg-neutral-200 text-neutral-700",
  };
  const texto =
    s.tipo === "no-horario"
      ? "No horário"
      : s.tipo === "atrasado"
        ? `Atrasado ${minutosEmTexto(s.minutos)}`
        : s.tipo === "faltou"
          ? "Faltou"
          : s.tipo === "hora-extra"
            ? `Hora extra ${minutosEmTexto(s.minutos)}`
            : s.tipo === "sem-saida"
              ? "Sem batida de saída"
              : "Sem CPF no cadastro";
  return <span className={`rounded-lg px-2.5 py-1 text-sm font-semibold ${estilos[s.tipo]}`}>{texto}</span>;
}

export default function Conferencia() {
  const [data, setData] = useState(hojeISO);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(() => variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );

  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    let cancelado = false;
    async function carregar() {
      const db = supabase();
      const [t, f, e, c] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo, equipe_turno_id"),
        db.from("escalas").select("id, data, turno_id, funcionario_id").eq("data", data),
        db.from("configuracoes").select("chave, valor"),
      ]);
      let ponto: RespostaPonto | null = null;
      let erroPonto: string | null = null;
      try {
        const resposta = await fetch(`/api/ponto?data=${data}`, { cache: "no-store" });
        if (!resposta.ok) throw new Error(`erro ${resposta.status}`);
        ponto = (await resposta.json()) as RespostaPonto;
      } catch (x) {
        erroPonto = `Não foi possível buscar as marcações de ponto (${x instanceof Error ? x.message : x}).`;
      }
      if (cancelado) return;
      const falha = t.error ?? f.error ?? e.error ?? c.error;
      if (falha) {
        setErro(`Não foi possível carregar a escala: ${falha.message}`);
        setDados(null);
      } else {
        setErro(null);
        setDados({
          turnos: t.data ?? [],
          funcionarios: f.data ?? [],
          escalas: e.data ?? [],
          configs: c.data ?? [],
          ponto,
          erroPonto,
        });
      }
      setCarregando(false);
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [data]);

  function irPara(novaData: string) {
    if (!novaData || novaData === data) return;
    setCarregando(true);
    setData(novaData);
  }

  const config = useMemo(() => lerConfigRegras(dados?.configs ?? []), [dados]);
  const resultado = useMemo(() => {
    if (!dados) return null;
    return conferirDia({
      data,
      turnos: dados.turnos,
      funcionarios: dados.funcionarios,
      escalas: dados.escalas,
      marcacoes: dados.ponto?.marcacoes ?? [],
      config,
    });
  }, [dados, data, config]);

  const fechado = dados ? diaFechado(config, data) : false;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conferência do dia</h1>
      <p className="text-neutral-700">Escala planejada x batidas do ponto.</p>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {DIAS_SEMANA[paraData(data).getDay()]} {diaMes(data)}
        </p>
        <input className="campo" type="date" value={data} onChange={(e) => irPara(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <button className="botao-secundario" onClick={() => irPara(somarDias(data, -1))}>
            ◀ Dia anterior
          </button>
          <button className="botao-secundario" onClick={() => irPara(somarDias(data, 1))}>
            Próximo dia ▶
          </button>
        </div>
        {data !== hojeISO() && (
          <button className="botao w-full" onClick={() => irPara(hojeISO())}>
            Voltar para hoje
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}
      {dados?.erroPonto && <p className="cartao border-red-300 text-red-700">{dados.erroPonto}</p>}
      {dados?.ponto?.fonte === "exemplo" && (
        <p className="cartao border-amber-300 bg-amber-50 text-amber-900">
          <strong>Mostrando dados de exemplo.</strong> A API de ponto não respondeu: {dados.ponto.aviso}{" "}
          {dados.ponto.marcacoes.length === 0 && "Os dados de exemplo só têm os dias 04/11 e 05/11/2026."}
        </p>
      )}

      {carregando && <p className="text-neutral-600">Carregando...</p>}

      {!carregando && resultado && (
        <div className={`space-y-4 ${carregando ? "opacity-60" : ""}`}>
          <section className="grid grid-cols-3 gap-2 text-center">
            <div className="cartao border-amber-300 bg-amber-50 px-2">
              <p className="text-3xl font-bold text-amber-900">{resultado.resumo.atrasos}</p>
              <p className="text-sm font-semibold text-amber-900">
                {resultado.resumo.atrasos === 1 ? "atraso" : "atrasos"}
              </p>
            </div>
            <div className="cartao border-red-300 bg-red-50 px-2">
              <p className="text-3xl font-bold text-red-800">{resultado.resumo.faltas}</p>
              <p className="text-sm font-semibold text-red-800">
                {resultado.resumo.faltas === 1 ? "falta" : "faltas"}
              </p>
            </div>
            <div className="cartao border-blue-300 bg-blue-50 px-2">
              <p className="text-3xl font-bold text-blue-900">{resultado.resumo.horasExtras}</p>
              <p className="text-sm font-semibold text-blue-900">
                {resultado.resumo.horasExtras === 1 ? "hora extra" : "horas extras"}
              </p>
            </div>
          </section>

          <h2 className="text-xl font-bold">Escalados ({resultado.linhas.length})</h2>
          {resultado.linhas.length === 0 && (
            <p className="cartao text-neutral-600">
              {fechado ? "Casa fechada neste dia." : "Ninguém escalado neste dia."}
            </p>
          )}
          <ul className="space-y-3">
            {resultado.linhas.map((l) => (
              <li key={l.funcionario.id} className="cartao space-y-2">
                <div>
                  <p className="text-lg font-semibold">{l.funcionario.nome}</p>
                  <p className="text-neutral-700">
                    {l.funcionario.funcao} · {l.turnos}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <dt className="text-neutral-600">Planejado</dt>
                    <dd className="text-base font-semibold">
                      {l.planejado.entrada} – {l.planejado.saida}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <dt className="text-neutral-600">Real</dt>
                    <dd className="text-base font-semibold">
                      {l.real ? `${l.real.entrada ?? "--:--"} – ${l.real.saida ?? "--:--"}` : "sem batida"}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {l.situacoes.map((s, i) => (
                    <Etiqueta key={i} s={s} />
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <h2 className="text-xl font-bold">Não escalados ({resultado.naoEscalados.length})</h2>
          <p className="text-sm text-neutral-600">Bateram ponto, mas não estavam na escala do dia.</p>
          {resultado.naoEscalados.length === 0 ? (
            <p className="cartao text-neutral-600">Ninguém.</p>
          ) : (
            <ul className="space-y-3">
              {resultado.naoEscalados.map((n) => (
                <li key={n.cpf} className="cartao">
                  <p className="text-lg font-semibold">{n.nome}</p>
                  <p className="text-neutral-700">
                    {n.funcao ?? `CPF ${n.cpf}`} · {n.entrada ?? "--:--"} – {n.saida ?? "--:--"}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="pt-2 text-center text-sm text-neutral-600">
            Fonte das marcações:{" "}
            <strong>
              {dados?.ponto?.fonte === "api"
                ? "API de ponto"
                : dados?.ponto?.fonte === "exemplo"
                  ? "dados de exemplo"
                  : "indisponível"}
            </strong>
            {" · "}tolerância {config.toleranciaAtraso} min · hora extra após {config.horaExtra} min
          </p>
        </div>
      )}
    </div>
  );
}
