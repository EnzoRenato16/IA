# IA da Assessoria

IA interna e **padronizada** para assessoria de investimentos. A equipe conversa por
uma tela web com login; a IA responde sempre segundo a base de conhecimento da casa —
com os limites de compliance embutidos.

Não é um chatbot genérico: o que define o comportamento são os arquivos em `base/` e
`comandos/`, que qualquer administrador edita pela própria interface.

---

## O que ela faz

Comandos disparados com `/` na caixa de mensagem:

| Comando | Para quê |
|---|---|
| `/print` | Lê uma print/foto: **transcreve fielmente** e depois **interpreta** no padrão da casa. `/print cru` devolve só a transcrição. |
| `/resposta` | Escreve a resposta ao cliente, pronta para copiar, usando as respostas padrão da casa |
| `/comparar` | Tabela comparativa objetiva entre produtos (prazo, indexador, liquidez, tributação, garantia) |
| `/explicar` | Traduz um conceito ou produto para linguagem de cliente leigo |
| `/revisar` | Revisa um texto **antes** de enviar: compliance → fatos → clareza |
| `/checklist` | Devolve o checklist do processo da casa para a situação |
| `/resumo` | Resume conversa/reunião/documento com foco em ação e pendências |

Sem comando, ela responde normalmente seguindo a identidade da casa.

## Compliance embutido

No Brasil o assessor **não pode fazer recomendação personalizada** — isso é consultoria
(Res. CVM 178/2023 vs. 19/2021). A regra está em `base/01-compliance.md` e é aplicada
em toda resposta: a IA recusa recomendar, explica por quê em uma frase, e **entrega o
que pode** (comparativo objetivo, régua da casa, checklist). Ela também não promete
rentabilidade, não afirma que investimento é seguro, e abrevia CPF em texto que circula.

> A área de compliance da assessoria deve revisar `base/01-compliance.md` antes do uso
> em produção. O arquivo é um ponto de partida, não um parecer jurídico.

---

## Rodando

Requer **Node 22+**.

```bash
npm install
cp .env.example .env      # preencha as chaves
npm run criar-usuario     # cria o primeiro login (papel admin)
npm run dev               # http://localhost:3000
```

Em produção:

```bash
npm run build
npm start
```

### Configuração (`.env`)

Funciona com a **API da Anthropic** ou com **AWS Bedrock** — muda só o `PROVIDER`.

**Anthropic direto:**

```env
PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

**AWS Bedrock** (o ID do modelo recebe o prefixo `anthropic.` automaticamente):

```env
PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_BEARER_TOKEN_BEDROCK=ABSK...        # chave de API do Bedrock
# ou, se usar credenciais IAM padrão, basta AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
```

Comuns aos dois:

| Variável | Padrão | O que faz |
|---|---|---|
| `SESSION_SECRET` | — | **Obrigatória.** Assina o cookie de sessão. Gere uma aleatória. |
| `MODEL` | `claude-opus-5` | Modelo forte |
| `MODEL_RAPIDO` | `claude-haiku-4-5` | Modelo barato para tarefas simples |
| `EFFORT` | `medium` | Profundidade do raciocínio do modelo forte: `low`…`max` |
| `MAX_TOKENS` | `8000` | Teto de saída por resposta |
| `NOME_ASSESSORIA` | `Assessoria` | Aparece na interface |
| `PORT` | `3000` | Porta |

### Dois modelos, por comando

Tarefa simples não precisa do modelo caro. Cada comando escolhe o seu no
frontmatter:

```markdown
---
nome: resumo
modelo: rapido      # usa MODEL_RAPIDO
---
```

`modelo: rapido` | `modelo: padrao` (padrão quando omitido). Comandos podem ainda
sobrescrever o esforço com `esforco: low`.

Medido neste projeto, mesma tarefa de `/resumo` com o cache quente:

| Modelo | Custo da chamada |
|---|---|
| `claude-haiku-4-5` | US$ 0,0018 |
| `claude-opus-5` | US$ 0,0209 |

**11x mais barato.** A distribuição atual:

| No modelo rápido | No modelo forte | Por quê |
|---|---|---|
| `/resumo`, `/checklist` | `/print`, `/resposta`, `/comparar`, `/revisar`, `/explicar` | O grupo da direita lê imagem, produz texto que vai ao cliente ou aplica regra de compliance — aí vale pagar pelo modelo melhor. |

Geração de título de conversa usa sempre o modelo rápido.

Teste antes de mover um comando para `rapido`: o modelo barato segue instruções
com menos rigor, e é justamente o rigor que sustenta o guardrail de compliance.

> ⚠️ **Detalhe técnico:** o Haiku 4.5 não aceita `effort` nem raciocínio
> adaptativo — mandar esses parâmetros devolve erro 400. O código detecta o
> modelo e monta os parâmetros conforme a capacidade dele. Se você trocar
> `MODEL_RAPIDO` por outro modelo, confira o que ele aceita.
>
> O cache do prompt é por modelo, então a base (~9 mil tokens) é gravada em cache
> uma vez para cada um. Compensa a partir da segunda chamada de cada modelo.

---

## Como padronizar a IA

Toda a inteligência de negócio está em dois diretórios de Markdown. **Não precisa mexer
em código.** Administradores editam pela tela `/admin`, e a mudança vale na resposta
seguinte — sem reiniciar.

### `base/` — a verdade da casa

| Arquivo | Conteúdo |
|---|---|
| `00-identidade.md` | Quem é a IA, tom de voz, como lida com o que não sabe |
| `01-compliance.md` | O que nunca fazer e como redirecionar pedidos de recomendação |
| `02-produtos.md` | Glossário de produtos, tributação, FGC, pegadinhas |
| `03-respostas-padrao.md` | Os textos oficiais para as situações recorrentes |
| `04-processos.md` | Abertura de conta, checklists, tabela de escalonamento |

Quanto mais real e específico for o conteúdo, mais a IA parece "da casa". Os arquivos
entregues vêm com marcadores `[X]` onde você precisa colocar seus números.

### `comandos/` — as funções

Cada `.md` é um comando. O frontmatter define o nome e se aceita imagem; o corpo é a
instrução que a IA segue.

```markdown
---
nome: proposta
titulo: Montar proposta
descricao: Estrutura uma proposta comercial no formato da casa
aceita_imagem: opcional
---

Monte a proposta seguindo esta estrutura: ...
```

Salvou o arquivo em `comandos/`, o comando `/proposta` aparece na interface. É assim que
a ferramenta cresce.

---

## Como funciona por dentro

```
Navegador ──POST /api/chat──> Express ──> Claude (Anthropic ou Bedrock)
    ↑                            │
    └────── SSE (streaming) ─────┘
```

O prompt do sistema é montado em dois blocos:

1. **Estável** — `base/` + todos os comandos. Leva `cache_control`, então em conversas
   seguidas é lido do cache a ~10% do preço em vez de reprocessado.
2. **Volátil** — data, nome do usuário, comando ativo. Fica depois do ponto de cache.

Medido em teste: a 1ª chamada grava ~9.300 tokens em cache; as seguintes leem esses
mesmos tokens do cache. É o que torna viável ter uma base grande.

Imagens vão como blocos base64 na mensagem (sem OCR — o próprio modelo enxerga a
imagem, o que lê tabela e print de conversa muito melhor que Tesseract). O histórico
guarda o texto das mensagens; imagens antigas não são reenviadas, só marcadas.

### Estrutura

```
base/           conhecimento da casa (editável na tela /admin)
comandos/       um .md por comando
src/
  config.ts       variáveis de ambiente e caminhos
  db.ts           persistência em JSON (trocável por Postgres)
  auth.ts         senha com scrypt + sessão em cookie assinado
  conhecimento.ts carrega base/ e comandos/, com hot-reload
  claude.ts       monta o prompt e chama o modelo (streaming)
  rotas/          chat.ts (SSE) e admin.ts (edição da base)
public/         interface (sem framework, sem build)
data/db.json    usuários e conversas — NÃO versionado
```

## Segurança

- Senhas com `scrypt` + sal por usuário; sessão em cookie `httpOnly` assinado com HMAC.
- Rate limit no login (5 tentativas / 5 min por e-mail).
- Edição da base restrita a `admin`, com validação de nome de arquivo contra path traversal.
- `.env` e `data/db.json` estão no `.gitignore` — **nunca commite chave de API**.
- Em produção, rode atrás de HTTPS (`NODE_ENV=production` marca o cookie como `secure`).

## Limitações conhecidas

- `data/db.json` é arquivo local: serve bem para uma equipe, não para escala ou múltiplas
  instâncias. Trocar por Postgres é uma mudança contida em `src/db.ts`.
- Imagens de mensagens anteriores não voltam ao contexto (economia de token). Se precisar
  reanalisar, reenvie a print.
- Não há upload de PDF ainda — converta a página em imagem, ou é o próximo passo natural.
