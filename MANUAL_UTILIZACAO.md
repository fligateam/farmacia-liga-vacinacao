# Manual de Utilização — Farmácia da Liga

Guia do dia a dia para Administradores e Operadores.

---

## Acesso à aplicação

Abre o link público da app no browser (computador, tablet ou telemóvel) e entra com o teu email e palavra-passe. No telemóvel, podes "Adicionar ao ecrã principal" para funcionar como uma app instalada (PWA).

---

## Ecrã de Agendamento

- O calendário mostra, em cada dia, o número de vagas restantes por vacina (badges G = Gripe, C = COVID, GC = Gripe Contingente).
- Dias marcados como **"Fechado"** não aceitam agendamentos.
- Usa os filtros no topo para ver apenas um tipo de vacina no calendário.
- Clica num dia para ver o resumo de vagas e, de seguida, em **"Agendar"** ou **"+ Novo Agendamento"**.
- Preenche NIF, nome, telefone, data e seleciona as vacinas pretendidas.
- O sistema valida automaticamente: máximo 1 vacina do mesmo tipo agendada por NIF, intervalo mínimo de 14 dias entre vacinas diferentes, e existência de stock (se a regra estiver ativa para essa vacina).

---

## Ecrã de Validação e Atendimento

- Pesquisa por **NIF, nome ou data** na barra de topo.
- Ativa **"Histórico completo"** para incluir também agendamentos arquivados (com mais de 12 meses).
- A coluna da esquerda mostra a **fila de chegada** — atribui manualmente a posição de cada utente à medida que chega, através do painel de detalhe.
- Clica numa linha da tabela para abrir o **detalhe do utente**, onde podes:
  - **Administrar** a vacina (pede o ID do lote usado).
  - Marcar como **Não administrada** (para COVID, inicia uma janela de urgência de 4h para recuperar a dose; para Gripe, a dose regressa automaticamente ao stock).
  - **Redirecionar/Recuperar** uma dose COVID não administrada para outro utente antes de expirar.
  - Registar uma **Quebra** (dose inutilizada), com motivo obrigatório.
- Exporta os dados filtrados em CSV através do botão no topo.

---

## Ecrã de Stock

- Os cartões no topo mostram o stock disponível por vacina em tempo real.
- A tabela lista todos os lotes, com entradas, retiradas, administradas e disponível.
- No formulário à direita, regista **Entradas** (com validade obrigatória) ou **Retiradas** (com motivo obrigatório: validade expirada, quebra, perda, transferência ou outro).
- A caixa de **Alertas** avisa automaticamente sobre lotes com stock baixo ou validade próxima (60 dias).
- Exporta a lista de stock em CSV a qualquer momento.

---

## Ecrã de Gestão de Horários (apenas Administrador)

- Clica num dia do calendário para configurar: se está aberto, horário de atendimento e o limite diário de vagas por vacina.
- Guarda a configuração — as vagas ficam imediatamente visíveis no Ecrã de Agendamento.
- Podes exportar marcações e presenças diretamente desta página.

---

## Ecrã de Dashboard

- Mostra as métricas da **semana atual**, com o intervalo de datas visível no topo.
- Ativa **"Incluir histórico"** para juntar dados arquivados às métricas.
- Gráficos disponíveis: agendamentos por tipo de vacina, taxa de comparência, e tendência diária (agendadas vs. administradas).
- O painel de **Métricas operacionais** mostra doses COVID recuperadas, quebras registadas, doses em janela de urgência e devoluções de stock de Gripe.
- Exporta um relatório da semana em CSV.

---

## Permissões

| Ação | Operador | Administrador |
|---|---|---|
| Criar/consultar agendamentos | Sim | Sim |
| Validar presença e administrar vacinas | Sim | Sim |
| Gerir stock (entradas/retiradas) | Sim | Sim |
| Configurar horários e limites de vagas | Não | Sim |
| Consultar relatórios/dashboard | Sim | Sim |
| Criar novos utilizadores | Não | Sim |

Todas as ações críticas (criar, alterar, cancelar) ficam registadas no log de auditoria, visível apenas para Administradores.
