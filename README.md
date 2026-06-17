# Ponto guardian

Widget de monitoramento de jornada integrado ao Secullum Ponto Web.

## Instalação

Baixa e abre o app com um único comando:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/diovani-f/ponto-guardian/master/install.sh)
```

Na primeira execução o script baixa o .AppImage e abre o app.
Nas próximas, apenas abre.

### Dependências

```bash
sudo apt install curl jq
```

## Configuração

Na primeira abertura, clique em ⚙ no widget e preencha:

- **Login:** seu número de folha
- **Senha:** sua senha do Secullum
- **Carga horária:** suas horas diárias (ex: 6)

O empresaId já vem preenchido como 18914.

## Notificações

| Notificação | Quando dispara |
|---|---|
| Hora de bater o ponto | No entryTime configurado, se ainda não há batidas |
| Nova batida | Sempre que um novo ponto é detectado |
| Aviso antes do fim | Quando restam warningMinutes minutos para completar a jornada |
| Jornada concluída | Quando o tempo trabalhado atinge a carga horária |
| Hora do almoço | No lunchTime configurado, se ainda há apenas 1 batida |
| Hora de voltar | 1 hora após o horário real da 2ª batida |
| Bata o ponto de saída | A cada 15 min após jornada concluída com 3+ batidas |

---

## Para desenvolvedores

### Pré-requisitos

- Node.js 20+
- npm

### Setup

```bash
npm install
cp config/settings.example.json config/settings.json
# edite config/settings.json com seu login e senha
```

### Comandos

```bash
npm run electron    # roda em foreground
npm run start:bg    # roda em segundo plano
npm run dist        # gera o .AppImage em release/
```

Após gerar o .AppImage, faça upload na aba Releases do GitHub.
