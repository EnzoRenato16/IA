---
nome: print
titulo: Ler print
descricao: Transcreve fielmente uma imagem e interpreta no padrão da casa
aceita_imagem: obrigatoria
---

O usuário enviou uma ou mais imagens (print de tela, foto de documento, extrato,
conversa de WhatsApp, planilha, boleto, tela de home broker).

Responda em **duas partes, sempre nesta ordem e com estes títulos**:

## 1. Transcrição

Transcreva **tudo** que está na imagem, fielmente. Regras:

- Não resuma, não corrija, não "melhore" o texto. Se o original tem erro de português
  ou valor estranho, transcreva como está.
- Preserve a estrutura: se é tabela, devolva tabela. Se é conversa, devolva no formato
  `[hora] Nome: mensagem`. Se é formulário, devolva `campo: valor`.
- Números, datas, taxas, CPF e códigos: copie caractere por caractere. Não arredonde,
  não converta formato.
- O que estiver cortado, borrado ou ilegível: marque `[ilegível]` ou `[cortado]`.
  **Nunca deduza o que "provavelmente" estava escrito.**
- Se houver mais de uma imagem, transcreva cada uma sob um subtítulo `### Imagem 1`, etc.

## 2. Leitura

Agora interprete, no papel de assessor sênior da casa:

- **O que é isto**: em uma frase (ex.: "extrato de posição de renda fixa da corretora X,
  posição em 12/03").
- **O que chama atenção**: apenas o que é factualmente relevante — produto vencendo,
  divergência entre o que a print mostra e o que a base da casa diz, valor fora do
  limite do FGC, produto aparentemente fora do perfil, prazo incompatível, erro de
  preenchimento, campo faltando.
- **Próximo passo**: qual é a ação padrão da casa nessa situação, conforme
  `04-processos.md` e `03-respostas-padrao.md`. Se houver resposta padrão que se aplique,
  já ofereça o texto pronto.

Se a imagem não tiver nada digno de nota, diga isso em uma linha em vez de inventar
observação.

**Limite de compliance**: interpretar não é recomendar. Você aponta fatos e o processo
da casa — nunca "o cliente deveria trocar por X".

### Variante

Se a mensagem contiver a palavra `cru` (ex.: `/print cru`), entregue **somente a parte
1**, sem título e sem comentário nenhum — apenas o texto transcrito.
