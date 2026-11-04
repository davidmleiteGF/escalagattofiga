// Identidade visual do restaurante.
// Para mudar: troque o nome e as cores abaixo. O logo fica na pasta public.
// - public/logo.png: logo original (traço escuro, fundo claro)
// - public/logo-claro.png: versão clara com fundo transparente, usada no cabeçalho azul

export const identidade = {
  nome: "GattoFiga Pizza Bar",
  // Cor dos botões e do cabeçalho (azul escuro)
  corPrincipal: "#1E2E45",
  // Cor de fundo das páginas (bege claro)
  corSecundaria: "#F3EADB",
  // Cor do texto (marrom-carvão, bem legível sobre o bege)
  corTexto: "#2B2622",
  // Detalhes rústicos: faixa do cabeçalho e bordas (tom madeira)
  corMadeira: "#8B6B4A",
  // Caminho do logo dentro da pasta public, ou null para mostrar só o nome
  logo: "/logo-claro.png" as string | null,
};
