"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Configuracao, type Regra, type Turno } from "@/lib/tipos";
import { DIAS_SEMANA } from "@/lib/datas";
import { CHAVE_FECHAR_ABRIR, CHAVE_FOLGAS, lerConfigRegras } from "@/lib/regras";

type Formulario = {
  id: string | null; // null = regra nova
  turno_id: string;
  dia: string; // "" = todos os dias; "0".."6" = dia da semana
  funcao: string;
  minimo: string;
};

// Ordem dos dias na tela: segunda a domingo.
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

async function buscarTudo() {
  const db = supabase();
  const [t, r, c, f] = await Promise.all([
    db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem").returns<Turno[]>(),
    db.from("regras").select("id, dia_semana, turno_id, funcao, minimo").returns<Regra[]>(),
    db.from("configuracoes").select("chave, valor").returns<Configuracao[]>(),
    db.from("funcionarios").select("funcao").returns<{ funcao: string }[]>(),
  ]);
  const falha = t.error ?? r.error ?? c.error ?? f.error;
  return {
    falha,
    turnos: t.data ?? [],
    regras: r.data ?? [],
    configs: c.data ?? [],
    funcoesUsadas: (f.data ?? []).map((x) => x.funcao),
  };
}

export default function Regras() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [funcoesUsadas, setFuncoesUsadas] = useState<string[]>([]);
  const [folgas, setFolgas] = useState("1");
  const [fecharAbrir, setFecharAbrir] = useState(true);
  const [carregando, setCarregando] = useState(() => variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  const aplicar = useCallback((dados: Awaited<ReturnType<typeof buscarTudo>>) => {
    if (dados.falha) {
      setErro(`Não foi possível carregar as regras: ${dados.falha.message}`);
    } else {
      setTurnos(dados.turnos);
      setRegras(dados.regras);
      setFuncoesUsadas(dados.funcoesUsadas);
      const config = lerConfigRegras(dados.configs);
      setFolgas(String(config.folgasMinimas));
      setFecharAbrir(config.bloquearFecharEAbrir);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    buscarTudo().then(aplicar);
  }, [aplicar]);

  const funcoes = useMemo(() => {
    const todas = new Set([...FUNCOES_PADRAO, ...funcoesUsadas, ...regras.map((r) => r.funcao)]);
    return [...todas].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcoesUsadas, regras]);

  function ordenarRegras(lista: Regra[]): Regra[] {
    const posDia = (d: number | null) => (d === null ? -1 : ORDEM_DIAS.indexOf(d));
    return [...lista].sort(
      (a, b) => posDia(a.dia_semana) - posDia(b.dia_semana) || a.funcao.localeCompare(b.funcao, "pt-BR"),
    );
  }

  async function salvarConfig() {
    const numero = Number(folgas);
    if (!Number.isInteger(numero) || numero < 0 || numero > 7) {
      setErro("Folgas mínimas: use um número de 0 a 7.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase()
      .from("configuracoes")
      .upsert([
        { chave: CHAVE_FOLGAS, valor: String(numero) },
        { chave: CHAVE_FECHAR_ABRIR, valor: fecharAbrir ? "true" : "false" },
      ]);
    setSalvando(false);
    if (error) setErro(`Não foi possível salvar: ${error.message}`);
    else {
      setErro(null);
      setMensagem("Configurações salvas.");
    }
  }

  async function salvarRegra(e: React.FormEvent) {
    e.preventDefault();
    if (!formulario) return;
    const minimo = Number(formulario.minimo);
    if (!formulario.turno_id || !formulario.funcao || !Number.isInteger(minimo) || minimo < 0) {
      setErro("Preencha turno, função e um mínimo (número inteiro).");
      return;
    }
    const dia_semana = formulario.dia === "" ? null : Number(formulario.dia);
    const repetida = regras.some(
      (r) =>
        r.id !== formulario.id &&
        r.turno_id === formulario.turno_id &&
        r.dia_semana === dia_semana &&
        r.funcao === formulario.funcao,
    );
    if (repetida) {
      setErro("Já existe uma regra para esse turno, dia e função. Edite a que já existe.");
      return;
    }
    setSalvando(true);
    const dados = { turno_id: formulario.turno_id, dia_semana, funcao: formulario.funcao, minimo };
    const tabela = supabase().from("regras");
    const { error } = formulario.id
      ? await tabela.update(dados).eq("id", formulario.id)
      : await tabela.insert(dados);
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar a regra: ${error.message}`);
      return;
    }
    setErro(null);
    setMensagem("Regra salva.");
    setFormulario(null);
    aplicar(await buscarTudo());
  }

  async function removerRegra(r: Regra) {
    if (!window.confirm("Remover esta regra?")) return;
    const { error } = await supabase().from("regras").delete().eq("id", r.id);
    if (error) setErro(`Não foi possível remover: ${error.message}`);
    else {
      setMensagem("Regra removida.");
      aplicar(await buscarTudo());
    }
  }

  function novaRegra(turnoId: string) {
    setMensagem(null);
    setFormulario({ id: null, turno_id: turnoId, dia: "", funcao: "", minimo: "1" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editarRegra(r: Regra) {
    setMensagem(null);
    setFormulario({
      id: r.id,
      turno_id: r.turno_id,
      dia: r.dia_semana === null ? "" : String(r.dia_semana),
      funcao: r.funcao,
      minimo: String(r.minimo),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Regras da casa</h1>
      <p className="text-neutral-700">
        A Escala da semana mostra um alerta em vermelho quando alguma destas regras não é cumprida.
      </p>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}
      {mensagem && !erro && <p className="cartao border-green-300 text-green-800">{mensagem}</p>}

      {formulario && (
        <form onSubmit={salvarRegra} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">{formulario.id ? "Editar mínimo" : "Novo mínimo"}</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Turno</span>
            <select
              className="campo"
              value={formulario.turno_id}
              onChange={(e) => setFormulario({ ...formulario, turno_id: e.target.value })}
            >
              {turnos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Dia</span>
            <select
              className="campo"
              value={formulario.dia}
              onChange={(e) => setFormulario({ ...formulario, dia: e.target.value })}
            >
              <option value="">Todos os dias</option>
              {ORDEM_DIAS.map((d) => (
                <option key={d} value={String(d)}>
                  Só {DIAS_SEMANA[d].toLowerCase()}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-sm text-neutral-600">
              A regra de um dia específico vale no lugar da regra de &quot;todos os dias&quot;.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
            >
              <option value="">Escolha a função</option>
              {funcoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Mínimo de pessoas</span>
            <input
              className="campo"
              type="number"
              inputMode="numeric"
              min={0}
              value={formulario.minimo}
              onChange={(e) => setFormulario({ ...formulario, minimo: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" className="botao-secundario" onClick={() => setFormulario(null)}>
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="text-neutral-600">Carregando...</p>
      ) : (
        <>
          <h2 className="pt-2 text-xl font-bold">Mínimo de pessoas por turno</h2>
          {turnos.map((t) => {
            const doTurno = ordenarRegras(regras.filter((r) => r.turno_id === t.id));
            return (
              <section key={t.id} className="cartao space-y-3">
                <h3 className="text-lg font-semibold">{t.nome}</h3>
                {doTurno.length === 0 && <p className="text-neutral-600">Nenhum mínimo para este turno.</p>}
                <ul className="space-y-2">
                  {doTurno.map((r) => (
                    <li key={r.id} className="rounded-xl border border-neutral-200 p-3">
                      <p className="font-semibold">
                        {r.funcao}: mínimo {r.minimo}
                      </p>
                      <p className="text-sm text-neutral-600">
                        {r.dia_semana === null ? "Todos os dias" : `Só ${DIAS_SEMANA[r.dia_semana].toLowerCase()}`}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button className="botao-secundario" onClick={() => editarRegra(r)}>
                          Editar
                        </button>
                        <button className="botao-secundario" onClick={() => removerRegra(r)}>
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button className="botao w-full" onClick={() => novaRegra(t.id)}>
                  + Adicionar mínimo no {t.nome}
                </button>
              </section>
            );
          })}

          <h2 className="pt-2 text-xl font-bold">Folgas e fechamento</h2>
          <section className="cartao space-y-4">
            <label className="block">
              <span className="mb-1 block font-medium">Folgas mínimas por semana (por funcionário)</span>
              <input
                className="campo"
                type="number"
                inputMode="numeric"
                min={0}
                max={7}
                value={folgas}
                onChange={(e) => setFolgas(e.target.value)}
              />
              <span className="mt-1 block text-sm text-neutral-600">
                Folga é um dia sem nenhum turno. Use 0 para não conferir.
              </span>
            </label>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2">
              <input
                type="checkbox"
                className="h-6 w-6 accent-principal"
                checked={fecharAbrir}
                onChange={(e) => setFecharAbrir(e.target.checked)}
              />
              <span>
                <span className="block font-medium">Proibir fechar e abrir</span>
                <span className="block text-sm text-neutral-600">
                  Avisa quando alguém trabalha no último turno de um dia e no primeiro do dia seguinte.
                </span>
              </span>
            </label>
            <button className="botao w-full" onClick={salvarConfig} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar configurações"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
