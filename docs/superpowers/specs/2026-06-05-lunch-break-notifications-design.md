# Notificações de intervalo de almoço

**Data:** 2026-06-05

## Objetivo

Implementar suporte a intervalo obrigatório de 1 hora no fluxo de notificações do Ponto Guardian, com as seguintes regras:

1. Notificar o usuário no horário configurado de saída para almoço (enquanto o 2º ponto ainda não foi batido).
2. Após o 2º ponto ser detectado, notificar a volta do almoço 60 minutos depois.
3. Após o 3º ponto (volta do almoço), as notificações de fim de jornada já funcionam corretamente (carga horária líquida, sem intervalo).

---

## Configuração

Adicionar campo `lunchTime?: string` (formato `HH:MM`) à interface `Settings`. O campo é opcional para manter compatibilidade com configurações existentes. O usuário o preenche na tela de configurações.

---

## Regras de notificação

### Notificação de almoço (horário configurado)

- Disparada periodicamente (no loop de 30s existente) se:
  - `lunchTime` está configurado, E
  - o dia ainda não tem 2 pontos (2º ponto não foi batido), E
  - a hora atual `>= lunchTime`, E
  - a threshold `lunch_time` ainda não foi notificada hoje.
- Mensagem: "Hora do almoço! Lembre-se de bater o ponto."

### Notificação de volta (60 min após 2º ponto)

- Disparada via `setTimeout` de 60 min quando `checkNotifications` detecta que o total de pontos do dia passou para 2 (o 2º ponto acabou de bater).
- A threshold `lunch_return_scheduled` é registrada em `notifiedThresholds` para não agendar mais de uma vez por dia.
- Mensagem: "Hora de voltar do almoço! Não esqueça de bater o ponto."

### Notificações de fim de jornada (comportamento existente)

- Continuam funcionando normalmente após o 3º ponto.
- O cálculo já é líquido (apenas pares ENTRY+EXIT), então descontar o intervalo não é necessário.

---

## Arquivos alterados

### `src/config/settings.ts`

- Adicionar `lunchTime?: string` à interface `Settings`.

### `electron/main.ts`

- Em `checkNotifications`: detectar quando `allPunches.length === 2` com novo ponto e agendar `setTimeout` de 60 min para notificação de volta.
- Em `pushUpdate` (ou no `setInterval` de 30s): verificar condição de notificação de almoço.
- Adicionar threshold keys: `lunch_time` e `lunch_return_scheduled`.

### `electron/renderer/settings.html`

- Adicionar campo "Horário de almoço" (input `time`, ex: `12:00`) na seção "Jornada".
- Incluir `lunchTime` no objeto salvo via `window.ponto.saveSettings`.
- Carregar `lunchTime` no `load()`.

---

## Fluxo de pontos (referência)

| Ponto | Tipo   | Ação gerada                                      |
|-------|--------|--------------------------------------------------|
| 1º    | ENTRY  | Nenhuma ação extra                               |
| 2º    | EXIT   | Agendar notificação de volta (+60 min)           |
| 3º    | ENTRY  | Notificações de fim de jornada passam a valer    |
| 4º    | EXIT   | Notificação de jornada concluída (já existente)  |

---

## Não está no escopo

- Validar se o intervalo batido foi menor que 1h (apenas notificação, sem bloqueio).
- Suporte a múltiplos intervalos no dia.
- Persistência do timer de volta em disco (se o app reiniciar durante o almoço, o timer é perdido).
