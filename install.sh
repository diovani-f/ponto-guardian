#!/usr/bin/env bash
set -euo pipefail

REPO="diovani-f/ponto-guardian"
INSTALL_DIR="$HOME/.local/bin"
APP_PATH="$INSTALL_DIR/ponto-guardian.AppImage"
CMD_PATH="$INSTALL_DIR/ponto"

# Cria o comando 'ponto' sempre (garante que exista mesmo em re-execuções)
mkdir -p "$INSTALL_DIR"
printf '#!/usr/bin/env bash\nnohup "$HOME/.local/bin/ponto-guardian.AppImage" --no-sandbox > /dev/null 2>&1 &\ndisown\n' > "$CMD_PATH"
chmod +x "$CMD_PATH"

# Garante que ~/.local/bin está no PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  SHELL_RC="$HOME/.bashrc"
  [ -n "${ZSH_VERSION-}" ] && SHELL_RC="$HOME/.zshrc"
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
  export PATH="$HOME/.local/bin:$PATH"
  echo "Adicionado ~/.local/bin ao PATH em $SHELL_RC"
fi

# Se já estiver instalado, apenas abre
if [ -x "$APP_PATH" ]; then
  echo "Abrindo Ponto Guardian..."
  nohup "$APP_PATH" --no-sandbox > /dev/null 2>&1 &
  disown
  echo "Para abrir novamente a qualquer momento, rode: ponto"
  exit 0
fi

echo "Instalando Ponto Guardian..."

for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Erro: '$cmd' não encontrado. Instale com: sudo apt install $cmd"
    exit 1
  fi
done

RELEASE_URL="https://api.github.com/repos/$REPO/releases/latest"
DOWNLOAD_URL=$(curl -fsSL "$RELEASE_URL" | jq -r '.assets[] | select(.name | endswith(".AppImage")) | .browser_download_url')

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Erro: nenhum AppImage encontrado na última release."
  exit 1
fi

echo "Baixando $(basename "$DOWNLOAD_URL")..."
curl -L --progress-bar "$DOWNLOAD_URL" -o "$APP_PATH"
chmod +x "$APP_PATH"

echo ""
echo "Instalado em $APP_PATH"
echo "Abrindo Ponto Guardian..."
nohup "$APP_PATH" --no-sandbox > /dev/null 2>&1 &
disown
echo "Pronto! Da próxima vez, basta rodar: ponto"
