"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";

type Formulario = {
  id: string | null; // null = novo funcionário
  nome: string;
  funcao: string;
  telefone: string;
};

const FORMULARIO_VAZIO: Formulario = { id: null, nome: "", funcao: "", telefone: "" };

function buscarEquipe() {
  return supabase()
    .from("funcionarios")
    .select("id, nome, funcao, telefone, cpf, ativo")
    .order("nome")
    .returns<Funcionario[]>();
}

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(() => variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  // Busca a equipe no banco e atualiza a tela.
  const carregar = useCallback(async () => {
    const { data, error } = await buscarEquipe();
    if (error) setErro(`Não foi possível carregar a equipe: ${error.message}`);
    else {
      setFuncionarios(data ?? []);
      setErro(null);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    buscarEquipe().then(({ data, error }) => {
      if (error) setErro(`Não foi possível carregar a equipe: ${error.message}`);
      else setFuncionarios(data ?? []);
      setCarregando(false);
    });
  }, []);

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

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
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    setSalvando(true);
    const dados = { nome, funcao, telefone: formulario.telefone.trim() || null };
    const db = supabase().from("funcionarios");
    const { error } = formulario.id
      ? await db.update(dados).eq("id", formulario.id)
      : await db.insert(dados);
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }
    setFormulario(null);
    await carregar();
  }

  async function mudarAtivo(f: Funcionario, ativo: boolean) {
    if (!ativo && !window.confirm(`Desativar ${f.nome}? Ele(a) deixa de aparecer na escala, mas o histórico fica guardado.`)) {
      return;
    }
    const { error } = await supabase().from("funcionarios").update({ ativo }).eq("id", f.id);
    if (error) setErro(`Não foi possível atualizar: ${error.message}`);
    else await carregar();
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
          <ul className="space-y-3">
            {ativos.map((f) => (
              <li key={f.id} className="cartao">
                <p className="text-lg font-semibold">{f.nome}</p>
                <p className="text-neutral-700">{f.funcao}</p>
                {f.telefone && (
                  <a href={`tel:${f.telefone.replace(/\D/g, "")}`} className="text-neutral-700 underline">
                    {f.telefone}
                  </a>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    className="botao-secundario"
                    onClick={() => {
                      setFormulario({
                        id: f.id,
                        nome: f.nome,
                        funcao: f.funcao,
                        telefone: f.telefone ?? "",
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Editar
                  </button>
                  <button className="botao-secundario" onClick={() => mudarAtivo(f, false)}>
                    Desativar
                  </button>
                </div>
              </li>
            ))}
          </ul>

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
