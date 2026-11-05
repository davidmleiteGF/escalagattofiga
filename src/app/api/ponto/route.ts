// Marcações de ponto de um dia. Roda no servidor: as credenciais da API
// nunca chegam ao navegador. Se a API falhar, usa os dados de exemplo.
import { NextResponse } from "next/server";
import { buscarMarcacoes, ErroPonto } from "@/lib/integracoes/ponto";
import type { Marcacao, RespostaPonto } from "@/lib/tipos";
import exemplo from "../../../../docs/marcacoes-exemplo.json";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = new URL(request.url).searchParams.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ erro: "Data inválida. Use AAAA-MM-DD." }, { status: 400 });
  }

  try {
    const marcacoes = await buscarMarcacoes(data);
    return NextResponse.json<RespostaPonto>({ fonte: "api", marcacoes });
  } catch (e) {
    const motivo = e instanceof ErroPonto ? e.message : "Erro inesperado ao consultar a API de ponto.";
    if (!(e instanceof ErroPonto)) console.error("Erro na API de ponto:", e);
    const marcacoes = (exemplo as Marcacao[]).filter((m) => m.data === data);
    return NextResponse.json<RespostaPonto>({ fonte: "exemplo", aviso: motivo, marcacoes });
  }
}
