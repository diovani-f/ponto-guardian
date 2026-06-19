# Ponto guardian

Widget de monitoramento de jornada integrado ao Secullum Ponto Web.

## Instalação

Quem só vai usar o app não precisa instalar Git, Node.js ou clonar o projeto. Use os comandos abaixo depois que houver uma release publicada no GitHub.

### Linux

Dependências:

```bash
sudo apt install curl jq
```

Instalar ou atualizar:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/diovani-f/ponto-guardian/master/install.sh)
```

O script baixa o `.AppImage`, salva em `~/.local/bin/ponto-guardian.AppImage` e cria o comando `ponto`.

### Windows

No PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "iwr https://raw.githubusercontent.com/diovani-f/ponto-guardian/master/install.ps1 -UseB | iex"
```

O script baixa o `.exe portable`, salva em `%LOCALAPPDATA%\PontoGuardian\Ponto Guardian.exe` e abre o aplicativo.

## Configuração

Na primeira abertura, clique em ⚙ no widget e preencha:

- **Login:** seu número de folha
- **Senha:** sua senha do Secullum
- **Carga horária:** suas horas diárias (ex: 6)

O empresaId já vem preenchido como 18914.

## Localização para bater ponto pelo widget

Para bater ponto pelo widget, use `Buscar localização no navegador` nas configurações. Esse fluxo abre o navegador padrão, solicita permissão de localização e salva a localização no app.

A localização do sistema via GeoClue é um fallback apenas para Linux. No Windows, use a captura pelo navegador.

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
npm run start:bg    # roda em segundo plano no Linux
npm run dist:linux  # gera o .AppImage em release/
npm run dist:win    # gera o .exe portable em release/
```

Use `npm run dist:win` preferencialmente em uma máquina Windows para garantir binários nativos corretos de `better-sqlite3`.

### Publicar release

O projeto gera os artefatos automaticamente no GitHub Actions quando uma tag `v*` é enviada.

```bash
git tag v0.1.1
git push origin v0.1.1
```

Depois que a action terminar, a release terá:

- **Linux:** `.AppImage`
- **Windows:** `.exe portable`

Colegas podem instalar usando apenas os comandos da seção `Instalação`, sem Git e sem Node.js.
