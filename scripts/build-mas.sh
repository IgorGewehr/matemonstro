#!/usr/bin/env bash
# Build para a MAC APP STORE: .app universal assinado (Apple Distribution +
# sandbox) empacotado num .pkg assinado com o certificado de instalador,
# pronto para subir pelo Transporter. Pré-requisitos (uma vez, ver APPSTORE.md):
#   1. Certificado "3rd Party Mac Developer Installer" (Mac Installer
#      Distribution) instalado no keychain;
#   2. Provisioning profile tipo "Mac App Store" do bundle
#      com.matemonstro.desktop salvo em src-tauri/embedded.provisionprofile;
#   3. App criado no App Store Connect com esse bundle id.
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="src-tauri/embedded.provisionprofile"
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
OUT="dist-mas"

if [[ ! -f "$PROFILE" ]]; then
  echo "✗ Falta $PROFILE"
  echo "  Crie em https://developer.apple.com/account/resources/profiles/add"
  echo "  (tipo: Mac App Store, App ID: com.matemonstro.desktop) e salve nesse caminho."
  exit 1
fi

INSTALLER_ID=$(security find-identity -v | grep -oE '"3rd Party Mac Developer Installer: [^"]*"' | head -1 | tr -d '"' || true)
if [[ -z "$INSTALLER_ID" ]]; then
  echo "✗ Certificado de instalador (Mac Installer Distribution) não encontrado no keychain."
  echo "  Crie em https://developer.apple.com/account/resources/certificates/add"
  echo "  (tipo: Mac Installer Distribution), baixe e dê dois cliques para instalar."
  exit 1
fi
echo "→ Instalador: $INSTALLER_ID"

# Binário universal (Intel + Apple Silicon) — exigido para boa cobertura na loja.
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null

echo "→ Build do .app (universal, sandbox, Apple Distribution)…"
npx tauri build --bundles app --target universal-apple-darwin --config src-tauri/tauri.mas.conf.json

APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Matemonstro.app"
[[ -d "$APP" ]] || { echo "✗ .app não encontrado em $APP"; exit 1; }

mkdir -p "$OUT"
PKG="$OUT/Matemonstro-$VERSION-mas.pkg"
echo "→ Empacotando e assinando $PKG…"
xcrun productbuild --component "$APP" /Applications --sign "$INSTALLER_ID" "$PKG"

echo
echo "✓ Pronto: $PKG"
echo "  Suba pelo Transporter.app (arraste o .pkg) ou:"
echo "  xcrun altool/notarytool não são necessários para MAS — só o Transporter."
