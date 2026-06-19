# Ponto guardian

Aplicativo do ponto integrado ao Secullum Ponto Web.

O app monitora a jornada, mostra notificações e pode bater ponto pelo widget usando o identificador do dispositivo e a localização salva no navegador.

## Instalação rápida

Quem só vai usar o app não precisa instalar Git, Node.js ou clonar o projeto.

<details>
<summary><strong>Linux</strong></summary>

### Como configurar no Linux

Execute no terminal:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/diovani-f/ponto-guardian/master/install.sh)
```

Após executar o comando, o sistema abrirá para preencher as configurações do ponto.

O script:

- **Baixa o app:** pega o `.AppImage` da última release.
- **Instala o comando:** cria o comando `ponto`.
- **Abre o aplicativo:** inicia o Ponto Guardian ao final.

### Como abrir novamente

Se fechar o aplicativo e quiser abrir de novo, execute:

```bash
ponto
```

<img width="3061" height="950" alt="image" src="https://github.com/user-attachments/assets/d1bc236e-9855-4923-9621-e5df88a0b703" />


</details>

<details>
<summary><strong>Windows</strong></summary>

### Como configurar no Windows

Abra o PowerShell e execute:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "iwr https://raw.githubusercontent.com/diovani-f/ponto-guardian/master/install.ps1 -UseB | iex"
```
<img width="1600" height="641" alt="WhatsApp Image 2026-06-19 at 16 26 35" src="https://github.com/user-attachments/assets/d6a0edae-7b62-4188-bbc2-bbf31d857d62" />

Após a execução, o sistema abrirá para preencher as configurações do ponto.

O script:

- **Baixa o app:** pega o `.exe portable` da última release.
- **Instala localmente:** salva em `%LOCALAPPDATA%\PontoGuardian\Ponto Guardian.exe`.
- **Abre o aplicativo:** inicia o Ponto Guardian ao final.

### Criar atalho na área de trabalho

Cole isso no PowerShell:

```powershell
$Target="$env:LOCALAPPDATA\PontoGuardian\Ponto Guardian.exe"; $Shortcut="$env:USERPROFILE\Desktop\Ponto Guardian.lnk"; $Shell=New-Object -ComObject WScript.Shell; $Link=$Shell.CreateShortcut($Shortcut); $Link.TargetPath=$Target; $Link.Save()
```
O app fica executando em segundo plano na bandeja do windows:
<img width="176" height="163" alt="WhatsApp Image 2026-06-19 at 16 26 54" src="https://github.com/user-attachments/assets/c5c5b1ed-01a7-4287-a43a-6ce149017e68" />


</details>

## Configuração do ponto

<details open>
<summary><strong>Como preencher os dados, precisa fazer uma única vez</strong></summary>

Na primeira abertura, clique na engrenagem do widget e preencha os dados.

### Dados básicos

- **ID da empresa:** `18914`
- **Login:** seu número de folha.
- **Senha:** sua senha do Secullum.
- **Carga horária:** sua carga diária, por exemplo `6`.

### Bater ponto pelo widget

Para usar o botão de bater ponto pelo widget, ative `Bater ponto pelo widget` e preencha o identificador do dispositivo.

Como pegar o identificador:

1. Abra o site do ponto no navegador.
2. Pressione `F12` ou clique com o botão direito e vá em `Inspecionar`.
3. Vá na aba `Application`.
4. Abra `Local storage`.
5. Copie o valor inteiro da chave `identificacaoNavegador`.
6. Cole esse valor no campo `Identificador do dispositivo` do Ponto Guardian.
<img width="6122" height="1900" alt="image" src="https://github.com/user-attachments/assets/b1652bb1-12f0-47ea-9cc7-14ee8084147d" />
<img width="1690" height="570" alt="image" src="https://github.com/user-attachments/assets/c63b296e-dad9-436f-9e1d-c2d15e9927ff" />

### Localização

1. Clique no botão `Buscar localização`.
2. O navegador será aberto.
3. Clique em `capturar localização`.
4. Aceite a permissão de localização no navegador.
5. Volte para o Ponto Guardian.
6. Clique em `Salvar` nas configurações.
<img width="3818" height="2088" alt="image" src="https://github.com/user-attachments/assets/3c227380-16ef-43fe-af5f-dfe25a054932" />

</details>

## Notificações

<details>
<summary><strong>Quando o app notifica</strong></summary>

| Notificação | Quando dispara |
|---|---|
| Hora de bater o ponto | No horário de entrada configurado, se ainda não há batidas |
| Nova batida | Sempre que um novo ponto é detectado |
| Aviso antes do fim | Quando faltam poucos minutos para completar a jornada |
| Jornada concluída | Quando o tempo trabalhado atinge a carga horária |
| Hora do almoço | No horário de almoço configurado, se ainda há apenas 1 batida |
| Hora de voltar | 1 hora após o horário real da 2ª batida |
| Bata o ponto de saída | A cada 15 minutos após jornada concluída com 3 ou mais batidas |

</details>

## Cuidados importantes

<details>
<summary><strong>Antes de bater ponto pelo widget</strong></summary>

O botão de bater ponto faz um registro real no Secullum.

Antes de usar, confirme que:

- **Login e senha:** estão corretos.
- **ID da empresa:** está como `18914`.
- **Identificador do dispositivo:** foi copiado do seu próprio navegador.
- **Localização:** foi capturada e salva.

Não use o identificador de dispositivo de outra pessoa.

</details>

## Para desenvolvedores

<details>
<summary><strong>Setup local</strong></summary>

### Pré-requisitos

- Node.js 20+
- npm

### Instalar dependências

```bash
npm install
```

### Rodar em desenvolvimento

```bash
npm run electron
```

### Gerar builds locais

```bash
npm run dist:linux
npm run dist:win
```

Use `npm run dist:win` preferencialmente em uma máquina Windows para garantir binários nativos corretos de `better-sqlite3`.

</details>

<details>
<summary><strong>Publicar release</strong></summary>

O projeto gera os artefatos automaticamente no GitHub Actions quando uma tag `v*` é enviada.

Exemplo:

```bash
git tag v2
git push origin v2
```

Depois que a action terminar, a release terá:

- **Linux:** `.AppImage`
- **Windows:** `.exe portable`

Colegas podem instalar usando apenas os comandos da seção `Instalação rápida`, sem Git e sem Node.js.

</details>
