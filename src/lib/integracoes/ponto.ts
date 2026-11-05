// Adaptador da API de ponto. Roda SÓ no servidor (Route Handler em src/app/api/ponto).
// Recebe as credenciais por variáveis de ambiente e devolve as marcações no
// formato interno do sistema (tipo Marcacao em src/lib/tipos.ts).
// Para trocar de fornecedor, mude só este arquivo. Documentação: docs/api-ponto.md

import "server-only";
import type { Marcacao } from "@/lib/tipos";

export class ErroPonto extends Error {}

function configuracao() {
  const url = process.env.PONTO_API_URL;
  const clientId = process.env.PONTO_CLIENT_ID;
  const apiKey = process.env.PONTO_API_KEY;
  const secret = process.env.PONTO_API_SECRET;
  const faltando = [
    !url && "PONTO_API_URL",
    !clientId && "PONTO_CLIENT_ID",
    !apiKey && "PONTO_API_KEY",
    !secret && "PONTO_API_SECRET",
  ].filter(Boolean);
  if (faltando.length) {
    throw new ErroPonto(`Variáveis de ambiente não configuradas: ${faltando.join(", ")}.`);
  }
  return { url: url!.replace(/\/+$/, ""), clientId: clientId!, apiKey: apiKey!, secret: secret! };
}

/** "8:05", "08:05:00" -> "08:05"; vazio ou inválido -> null */
function hora(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** Marcações de um dia (data no formato AAAA-MM-DD). */
export async function buscarMarcacoes(data: string): Promise<Marcacao[]> {
  const cfg = configuracao();
  let resposta: Response;
  try {
    resposta = await fetch(`${cfg.url}/api/marcacoes?data=${encodeURIComponent(data)}`, {
      headers: {
        "X-Client-Id": cfg.clientId,
        "X-Api-Key": cfg.apiKey,
        Authorization: `Bearer ${cfg.secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ErroPonto("A API de ponto não respondeu (sem conexão ou demorou demais).");
  }

  if (!resposta.ok) {
    let detalhe = "";
    try {
      const corpo = (await resposta.json()) as { erro?: string };
      if (corpo?.erro) detalhe = `: ${corpo.erro}`;
    } catch {
      // corpo não é JSON; segue sem detalhe
    }
    if (resposta.status === 401) throw new ErroPonto(`A API de ponto recusou as credenciais${detalhe}.`);
    throw new ErroPonto(`A API de ponto respondeu com erro ${resposta.status}${detalhe}.`);
  }

  const corpo: unknown = await resposta.json().catch(() => null);
  if (!Array.isArray(corpo)) throw new ErroPonto("A API de ponto devolveu dados num formato inesperado.");

  return corpo
    .map((item: Record<string, unknown>) => ({
      cpf: String(item.cpf ?? "").replace(/\D/g, ""),
      data: String(item.data ?? data),
      entrada: hora(item.entrada),
      saida_intervalo: hora(item.saida_intervalo),
      volta_intervalo: hora(item.volta_intervalo),
      saida: hora(item.saida),
    }))
    .filter((m) => m.cpf.length === 11);
}
