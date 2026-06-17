#!/usr/bin/env bash
set -euo pipefail

REPO="diovani-f/ponto-guardian"
INSTALL_DIR="$HOME/.local/bin"
APP_PATH="$INSTALL_DIR/ponto-guardian.AppImage"

if [ -x "$APP_PATH" ]; then
  echo "Abrindo Ponto Guardian..."
  nohup "$APP_PATH" --no-sandbox > /dev/null 2>&1 &
  disown
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

mkdir -p "$INSTALL_DIR"
echo "Baixando $(basename "$DOWNLOAD_URL")..."
curl -L --progress-bar "$DOWNLOAD_URL" -o "$APP_PATH"
chmod +x "$APP_PATH"

echo ""
echo "Instalado em $APP_PATH"
echo "Abrindo Ponto Guardian..."
nohup "$APP_PATH" --no-sandbox > /dev/null 2>&1 &
disown
echo "Pronto! Na próxima vez, basta rodar: bash install.sh"
