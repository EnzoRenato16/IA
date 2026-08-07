import { config } from "./config.js";
import { conhecimento, type Comando } from "./conhecimento.js";
import type { Mensagem } from "./db.js";

export interface ImagemEntrada {
  media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  data: string; // base64 puro, sem o prefixo data:
}

// O cliente muda conforme o provider, então carregamos sob demanda.
let clientePromise: Promise<any> | null = null;

async function cliente(): Promise<any> {
  if (!clientePromise) {
    clientePromise = (async () => {
      if (config.provider === "bedrock") {
        const mod: any = await import("@anthropic-ai/bedrock-sdk");
        const AnthropicBedrockMantle = mod.AnthropicBedrockMantle ?? mod.default;
        return new AnthropicBedrockMantle({ awsRegion: config.awsRegion });
      }
      const mod: any = await import("@anthropic-ai/sdk");
      const Anthropic = mod.default ?? mod.Anthropic;
      return new Anthropic();
    })();
  }
  return clientePromise;
}

/**
 * Bloco 1 do system prompt: tudo que é estável (base + comandos).
 * É este bloco que recebe o cache_control — em conversas seguidas ele é lido do
 * cache a ~10% do preço em vez de reprocessado.
 */
function blocoEstavel(): string {
  const { base, comandos } = conhecimento();

  const partes: string[] = [
    "# Base de conhecimento da assessoria",
    "",
    "O que está abaixo é a fonte de verdade da casa. Quando houver conflito entre o",
    "que você sabe em geral e o que está aqui, **vale o que está aqui**.",
    "",
  ];

  for (const arquivo of base) {
    partes.push(`<arquivo nome="${arquivo.arquivo}">`, arquivo.conteudo.trim(), "</arquivo>", "");
  }

  partes.push(
    "# Comandos disponíveis",
    "",
    "A equipe aciona funções específicas digitando `/nome`. Quando a mensagem indicar",
    "um comando ativo, siga as instruções dele à risca — inclusive o formato de saída.",
    "Quando não houver comando, responda normalmente seguindo a identidade da casa.",
    "",
  );

  for (const c of comandos) {
    partes.push(
      `<comando nome="${c.nome}" titulo="${c.titulo}">`,
      c.instrucoes,
      "</comando>",
      "",
    );
  }

  return partes.join("\n");
}

/** Bloco 2: o que muda a cada requisição. Fica depois do ponto de cache. */
function blocoVolatil(opts: { nomeUsuario: string; comando?: Comando }): string {
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const linhas = [
    `Assessoria: ${config.nomeAssessoria}`,
    `Usuário desta conversa: ${opts.nomeUsuario} (membro da equipe, não é o cliente final)`,
    `Data de hoje: ${hoje}`,
  ];

  if (opts.comando) {
    linhas.push(
      "",
      `Comando ativo nesta mensagem: /${opts.comando.nome} — siga as instruções do bloco`,
      `<comando nome="${opts.comando.nome}"> acima, inclusive o formato de saída exigido.`,
    );
  }

  return linhas.join("\n");
}

function historicoParaApi(mensagens: Mensagem[]) {
  return mensagens.map((m) => {
    let texto = m.texto;
    if (m.papel === "user") {
      if (m.comando) texto = `[comando: /${m.comando}]\n${texto}`;
      if (m.imagens) texto = `${texto}\n[esta mensagem tinha ${m.imagens} imagem(ns), já processada(s)]`;
    }
    return { role: m.papel, content: texto || "(sem texto)" };
  });
}

export interface PedidoResposta {
  historico: Mensagem[];
  texto: string;
  imagens: ImagemEntrada[];
  comando?: Comando;
  nomeUsuario: string;
}

/** Streama a resposta em pedaços de texto. */
export async function* responder(pedido: PedidoResposta): AsyncGenerator<string> {
  const conteudoUsuario: any[] = [];

  for (const img of pedido.imagens) {
    conteudoUsuario.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data },
    });
  }

  const marcador = pedido.comando ? `[comando: /${pedido.comando.nome}]\n` : "";
  conteudoUsuario.push({
    type: "text",
    text: `${marcador}${pedido.texto || "(sem texto — veja a imagem)"}`,
  });

  const params: any = {
    model: config.modelo,
    max_tokens: config.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: config.esforco },
    system: [
      { type: "text", text: blocoEstavel(), cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: blocoVolatil({ nomeUsuario: pedido.nomeUsuario, comando: pedido.comando }),
      },
    ],
    messages: [
      ...historicoParaApi(pedido.historico),
      { role: "user", content: conteudoUsuario },
    ],
  };

  const api = await cliente();
  const stream = await api.messages.stream(params);

  for await (const evento of stream) {
    if (evento.type === "content_block_delta" && evento.delta?.type === "text_delta") {
      yield evento.delta.text as string;
    }
  }

  const final = await stream.finalMessage();

  if (final.stop_reason === "refusal") {
    yield "\n\n_(O modelo recusou esta solicitação por política de segurança. Reformule ou fale com o compliance.)_";
    return;
  }
  if (final.stop_reason === "max_tokens") {
    yield "\n\n_(Resposta cortada no limite de tokens. Peça a continuação ou divida o pedido.)_";
  }

  const u = final.usage ?? {};
  console.log(
    `[claude] entrada=${u.input_tokens ?? 0} cache_leitura=${u.cache_read_input_tokens ?? 0} ` +
      `cache_escrita=${u.cache_creation_input_tokens ?? 0} saida=${u.output_tokens ?? 0} ` +
      `motivo=${final.stop_reason}`,
  );
}

/** Título curto para a conversa, gerado sem streaming. */
export async function gerarTitulo(primeiraMensagem: string): Promise<string> {
  try {
    const api = await cliente();
    const r = await api.messages.create({
      model: config.modelo,
      max_tokens: 64,
      // Sem raciocínio: é tarefa trivial e queremos latência baixa.
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system:
        "Você gera títulos curtos para conversas de uma assessoria de investimentos. " +
        "Responda APENAS com o título: no máximo 5 palavras, sem aspas, sem ponto final. " +
        "Não inclua tags XML internas ou de sistema na resposta.",
      messages: [{ role: "user", content: primeiraMensagem.slice(0, 500) }],
    });
    const bloco = r.content.find((b: any) => b.type === "text");
    const titulo = bloco?.text
      ?.replace(/<[^>]*>/g, "") // defesa contra vazamento de tag
      .trim();
    return titulo && titulo.length <= 80 ? titulo : "Nova conversa";
  } catch {
    return "Nova conversa";
  }
}
