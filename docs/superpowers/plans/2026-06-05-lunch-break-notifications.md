# Lunch break notifications implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar notificações de intervalo de almoço: aviso no horário configurado (se 2º ponto ainda não batido) e aviso de volta 60 min após o 2º ponto.

**Architecture:** As mudanças se concentram em três pontos: (1) adicionar `lunchTime` à interface `Settings`; (2) ampliar `checkNotifications` e o loop de 30s em `main.ts` com os dois novos fluxos; (3) adicionar o campo visual na tela de configurações.

**Tech Stack:** Electron 33, TypeScript, esbuild, HTML/CSS/JS puro no renderer.

---

### Task 1: Adicionar `lunchTime` à interface `Settings`

**Files:**
- Modify: `src/config/settings.ts`

- [ ] **Step 1: Adicionar o campo opcional à interface**

Em `src/config/settings.ts`, adicionar `lunchTime?: string` à interface `Settings`:

```typescript
export interface Settings {
  empresaId: number;
  login: string;
  senha: string;
  dailyHours: number;
  warningMinutes: number;
  syncIntervalMinutes: number;
  allowOvertime?: boolean;
  lunchTime?: string;
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit -p /home/diovani/projects/ponto-guardian/tsconfig.json
```

Expected: sem erros.

---

### Task 2: Implementar as notificações de almoço em `main.ts`

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Adicionar variável de controle do timer de volta**

Logo após a declaração `const notifiedThresholds = new Set<string>();` (linha 20), adicionar:

```typescript
let lunchReturnTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 2: Limpar o timer de volta no reset de notificações**

Na função `resetNotifIfNewDay`, após `notifiedThresholds.clear()`, cancelar o timer pendente:

```typescript
function resetNotifIfNewDay(): void {
  const today = getTodayKey();
  if (today !== notifDay) {
    notifDay = today;
    notifiedThresholds.clear();
    if (lunchReturnTimer) {
      clearTimeout(lunchReturnTimer);
      lunchReturnTimer = null;
    }
  }
}
```

- [ ] **Step 3: Agendar notificação de volta após o 2º ponto**

No final de `checkNotifications`, antes do `pushUpdate()`, adicionar o bloco que agenda a notificação de volta:

```typescript
  // Notificação de volta do almoço (60 min após o 2º ponto)
  if (
    newPunches.length > 0 &&
    allPunches.length === 2 &&
    !notifiedThresholds.has('lunch_return_scheduled')
  ) {
    notifiedThresholds.add('lunch_return_scheduled');
    if (lunchReturnTimer) clearTimeout(lunchReturnTimer);
    lunchReturnTimer = setTimeout(() => {
      sendNotification(
        'Hora de voltar!',
        'Já passou 1 hora de almoço. Não esqueça de bater o ponto.',
      );
    }, 60 * 60 * 1000);
  }

  pushUpdate();
```

O bloco deve substituir o `pushUpdate()` que estava no final da função. A função completa fica assim:

```typescript
function checkNotifications(newPunches: Punch[]): void {
  resetNotifIfNewDay();

  const date = getTodayKey();
  const allPunches = getPunchesForDate(date);
  const summary = buildSummary(date, allPunches, getDailyMinutes());
  const settings = getSettings();
  const remaining = summary.remainingMinutes;

  if (newPunches.length > 0) {
    const label = newPunches.map((p) => `${p.name} ${p.time}`).join(', ');
    sendNotification('Ponto Guardian', `Nova batida: ${label}`);
  }

  if (remaining <= 0) {
    if (!notifiedThresholds.has('complete')) {
      notifiedThresholds.add('complete');
      sendNotification(
        'Jornada concluída!',
        `Você completou suas ${settings.dailyHours}h. Lembre-se de bater a saída.`,
      );
    }
    if (settings.allowOvertime) {
      const overtime = Math.abs(remaining);
      const key = `overtime_${Math.floor(overtime / 5) * 5}`;
      if (!notifiedThresholds.has(key)) {
        notifiedThresholds.add(key);
        sendNotification(
          'Hora extra',
          `Você está em hora extra há ${formatMinutes(overtime)}.`,
        );
      }
    }
  } else if (remaining <= 5 && !notifiedThresholds.has('5min')) {
    notifiedThresholds.add('5min');
    sendNotification('Ponto Guardian', 'Prepare-se para bater o ponto. Faltam menos de 5 minutos!');
  } else if (remaining <= settings.warningMinutes && !notifiedThresholds.has('warning')) {
    notifiedThresholds.add('warning');
    sendNotification(
      'Ponto Guardian',
      `Faltam ${formatMinutes(remaining)} para completar sua jornada.`,
    );
  }

  // Notificação de volta do almoço (60 min após o 2º ponto)
  if (
    newPunches.length > 0 &&
    allPunches.length === 2 &&
    !notifiedThresholds.has('lunch_return_scheduled')
  ) {
    notifiedThresholds.add('lunch_return_scheduled');
    if (lunchReturnTimer) clearTimeout(lunchReturnTimer);
    lunchReturnTimer = setTimeout(() => {
      sendNotification(
        'Hora de voltar!',
        'Já passou 1 hora de almoço. Não esqueça de bater o ponto.',
      );
    }, 60 * 60 * 1000);
  }

  pushUpdate();
}
```

- [ ] **Step 4: Adicionar verificação de horário de almoço no loop de 30s**

O `setInterval(pushUpdate, 30_000)` em `app.whenReady` deve ser substituído por uma função que também verifica o horário de almoço configurado:

```typescript
  setInterval(() => {
    resetNotifIfNewDay();
    const settings = getSettings();
    if (settings.lunchTime && !notifiedThresholds.has('lunch_time')) {
      const date = getTodayKey();
      const allPunches = getPunchesForDate(date);
      if (allPunches.length < 2) {
        const now = new Date();
        const nowHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        if (nowHHMM >= settings.lunchTime) {
          notifiedThresholds.add('lunch_time');
          sendNotification(
            'Hora do almoço!',
            'Lembre-se de bater o ponto antes de sair para o almoço.',
          );
        }
      }
    }
    pushUpdate();
  }, 30_000);
```

- [ ] **Step 5: Verificar compilação**

```bash
npx tsc --noEmit -p /home/diovani/projects/ponto-guardian/tsconfig.electron.json
```

Expected: sem erros.

---

### Task 3: Adicionar campo de horário de almoço na tela de configurações

**Files:**
- Modify: `electron/renderer/settings.html`

- [ ] **Step 1: Adicionar estilo para input time**

Dentro do bloco `<style>`, após a regra `input[type="text"], input[type="password"] { ... }`, adicionar:

```css
    input[type="time"] {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      padding: 6px 10px;
      width: 100px;
      text-align: right;
      outline: none;
      transition: border-color 0.15s;
    }
```

- [ ] **Step 2: Adicionar campo na seção "Jornada"**

Dentro da `<div class="section">` que contém a `section-title` "Jornada", adicionar o novo campo após o campo "Permitir hora extra":

```html
    <div class="field">
      <div>
        <div class="field-label">Horário de almoço</div>
        <div class="field-hint">notifica na saída (opcional)</div>
      </div>
      <input type="time" id="lunchTime" />
    </div>
```

- [ ] **Step 3: Carregar o campo no `load()`**

Na função `load()` do `<script>`, após a linha que carrega `allowOvertime`, adicionar:

```javascript
      document.getElementById('lunchTime').value = s.lunchTime ?? '';
```

- [ ] **Step 4: Salvar o campo no handler de save**

No objeto `settings` dentro do handler do `saveBtn`, adicionar a propriedade `lunchTime`:

```javascript
        lunchTime: document.getElementById('lunchTime').value || undefined,
```

O objeto completo fica:

```javascript
      const settings = {
        dailyHours: parseFloat(document.getElementById('dailyHours').value),
        warningMinutes: parseInt(document.getElementById('warningMinutes').value),
        syncIntervalMinutes: parseInt(document.getElementById('syncIntervalMinutes').value),
        login: document.getElementById('login').value.trim(),
        senha: document.getElementById('senha').value,
        empresaId: parseInt(document.getElementById('empresaId').value),
        allowOvertime: document.getElementById('allowOvertime').checked,
        lunchTime: document.getElementById('lunchTime').value || undefined,
      };
```

---

### Task 4: Build e validação manual

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Build do Electron**

```bash
npm run electron --prefix /home/diovani/projects/ponto-guardian
```

Expected: build sem erros, widget Electron abre.

- [ ] **Step 2: Validação manual**

Cenários a verificar:

1. Abrir configurações, preencher "Horário de almoço" com o horário atual + 1 min, salvar. Aguardar 1 min: deve aparecer notificação "Hora do almoço!".
2. Quando o 2º ponto for detectado (via sync), deve aparecer notificação "Nova batida" normal e, após 60 min, a notificação "Hora de voltar!".
3. Se `lunchTime` for deixado em branco, nenhuma notificação de almoço deve aparecer.
4. Ao virar o dia (ou reiniciar o app), o timer de volta deve ser cancelado e os thresholds limpos.
