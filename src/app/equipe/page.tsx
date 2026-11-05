"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario, type Turno } from "@/lib/tipos";

type Formulario = {
  id: string | null; // null = novo funcionário
  nome: string;
  funcao: string;
  telefone: string;
  cpf: string;
  equipe_turno_id: string; // "" = sem equipe
};

const FORMULARIO_VAZIO: Formulario = {
  id: null,
  nome: "",
  funcao: "",
  telefone: "",
  cpf: "",
  equipe_turno_id: "",
};

async function buscarEquipe() {
  const db = supabase();
  const [f, t] = await Promise.all([
    db
      .from("funcionarios")
      .select("id, nome, funcao, telefone, cpf, ativo, equipe_turno_id")
      .order("nome")
      .returns<Funcionario[]>(),
    db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem").returns<Turno[]>(),
  ]);
  return { error: f.error ?? t.error, funcionarios: f.data ?? [], turnos: t.data ?? [] };
}

/** "12345678901" -> "123.456.789-01" */
function formatarCpf(cpf: string): string {
  return cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
}

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [carregando, setCarregando] = useState(() => variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const aplicar = useCallback((dados: Awaited<ReturnType<typeof buscarEquipe>>) => {
    if (dados.error) setErro(`Não foi possível carregar a equipe: ${dados.error.message}`);
    else {
      setFuncionarios(dados.funcionarios);
      setTurnos(dados.turnos);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    buscarEquipe().then(aplicar);
  }, [aplicar]);

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);
  const nomeEquipe = (id: string | null) => turnos.find((t) => t.id === id)?.nome;

  // Ativos agrupados por equipe (na ordem dos turnos) e, no fim, quem não tem equipe.
  const grupos = useMemo(() => {
    const lista = turnos.map((t) => ({
      titulo: `Equipe do ${t.nome}`,
      pessoas: ativos.filter((f) => f.equipe_turno_id === t.id),
    }));
    lista.push({
      titulo: "Sem equipe definida",
      pessoas: ativos.filter((f) => !f.equipe_turno_id || !turnos.some((t) => t.id === f.equipe_turno_id)),
    });
    return lista.filter((g) => g.pessoas.length);
  }, [ativos, turnos]);

  // Funções que já existem no banco + as funções padrão, sem repetir.
  const funcoes = useMemo(() => {
    const todas = new Set([...FUNCOES_PADRAO, ...funcionarios.map((f) => f.funcao)]);
    return [...todas].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcionarios]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao = formulario.funcao.trim();
    const cpf = formulario.cpf.replace(/\D/g, "");
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    if (cpf && cpf.length !== 11) {
      setErro("O CPF precisa ter 11 números (ou deixe em branco).");
      return;
    }
    setSalvando(true);
    const dados = {
      nome,
      funcao,
      telefone: formulario.telefone.trim() || null,
      cpf: cpf || null,
      equipe_turno_id: formulario.equipe_turno_id || null,
    };
    const db = supabase().from("funcionarios");
    const { error } = formulario.id
      ? await db.update(dados).eq("id", formulario.id)
      : await db.insert(dados);
    setSalvando(false);
    if (error) {
      setErro(
        error.code === "23505"
          ? "Já existe um funcionário com esse CPF."
          : `Não foi possível salvar: ${error.message}`,
      );
      return;
    }
    setErro(null);
    setFormulario(null);
    aplicar(await buscarEquipe());
  }

  async function mudarAtivo(f: Funcionario, ativo: boolean) {
    if (!ativo && !window.confirm(`Desativar ${f.nome}? Ele(a) deixa de aparecer na escala, mas o histórico fica guardado.`)) {
      return;
    }
    const { error } = await supabase().from("funcionarios").update({ ativo }).eq("id", f.id);
    if (error) setErro(`Não foi possível atualizar: ${error.message}`);
    else aplicar(await buscarEquipe());
  }

  function editar(f: Funcionario) {
    setFormulario({
      id: f.id,
      nome: f.nome,
      funcao: f.funcao,
      telefone: f.telefone ?? "",
      cpf: f.cpf ? formatarCpf(f.cpf) : "",
      equipe_turno_id: f.equipe_turno_id ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && (
          <button className="botao" onClick={() => setFormulario(FORMULARIO_VAZIO)}>
            + Adicionar
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
              required
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
            <span className="mb-1 block font-medium">Equipe</span>
            <select
              className="campo"
              value={formulario.equipe_turno_id}
              onChange={(e) => setFormulario({ ...formulario, equipe_turno_id: e.target.value })}
            >
              <option value="">Sem equipe definida</option>
              {turnos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-sm text-neutral-600">
              Quem é de uma equipe só aparece para ser escalado no turno dela.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">CPF</span>
            <input
              className="campo"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={formulario.cpf}
              onChange={(e) => setFormulario({ ...formulario, cpf: e.target.value })}
            />
            <span className="mt-1 block text-sm text-neutral-600">
              Usado para ligar o funcionário às batidas do ponto.
            </span>
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
          {ativos.length === 0 && !erro && (
            <p className="cartao text-neutral-600">Nenhum funcionário ativo. Toque em Adicionar.</p>
          )}
          {grupos.map((g) => (
            <section key={g.titulo} className="space-y-3">
              <h2 className="pt-2 text-xl font-bold">
                {g.titulo} <span className="text-base font-normal text-neutral-600">({g.pessoas.length})</span>
              </h2>
              <ul className="space-y-3">
                {g.pessoas.map((f) => (
                  <li key={f.id} className="cartao">
                    <p className="text-lg font-semibold">{f.nome}</p>
                    <p className="text-neutral-700">
                      {f.funcao}
                      {nomeEquipe(f.equipe_turno_id) && ` · ${nomeEquipe(f.equipe_turno_id)}`}
                    </p>
                    {f.telefone && (
                      <a href={`tel:${f.telefone.replace(/\D/g, "")}`} className="block text-neutral-700 underline">
                        {f.telefone}
                      </a>
                    )}
                    <p className="text-sm text-neutral-600">
                      {f.cpf ? `CPF ${formatarCpf(f.cpf)}` : "Sem CPF (não aparece na conferência do ponto)"}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button className="botao-secundario" onClick={() => editar(f)}>
                        Editar
                      </button>
                      <button className="botao-secundario" onClick={() => mudarAtivo(f, false)}>
                        Desativar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {inativos.length > 0 && (
            <section className="pt-2">
              <button
                className="botao-secundario w-full"
                onClick={() => setMostrarInativos(!mostrarInativos)}
              >
                {mostrarInativos ? "Esconder" : "Mostrar"} inativos ({inativos.length})
              </button>
              {mostrarInativos && (
                <ul className="mt-3 space-y-3">
                  {inativos.map((f) => (
                    <li key={f.id} className="cartao opacity-75">
                      <p className="text-lg font-semibold">{f.nome}</p>
                      <p className="text-neutral-700">{f.funcao} · inativo</p>
                      <button className="botao mt-3 w-full" onClick={() => mudarAtivo(f, true)}>
                        Reativar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
