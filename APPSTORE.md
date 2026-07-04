# Matemonstro na Mac App Store

Guia do empacotamento para a loja. O time Apple já existe (**79435F9XT5**, Apple
Distribution instalado) e o Transporter está na máquina — falta só o que está
marcado como **[uma vez]**.

## Pré-requisitos [uma vez]

1. **Certificado de instalador** — em
   [Certificates](https://developer.apple.com/account/resources/certificates/add),
   crie um **Mac Installer Distribution** ("3rd Party Mac Developer Installer"),
   baixe o `.cer` e dê dois cliques para instalar no keychain.
   (O de app, "Apple Distribution", já está instalado.)
2. **App ID** — em Identifiers, registre `com.matemonstro.desktop`
   (se ainda não existir).
3. **Provisioning profile** — em
   [Profiles](https://developer.apple.com/account/resources/profiles/add),
   crie um do tipo **Mac App Store** para esse App ID, baixe e salve como
   `src-tauri/embedded.provisionprofile` (o caminho exato importa; está no
   .gitignore).
4. **App Store Connect** — crie o app (plataforma macOS, bundle
   `com.matemonstro.desktop`, nome "Matemonstro", categoria Educação, preço
   grátis). Prepare os metadados: descrição, screenshots (1280×800 ou
   2560×1600), política de privacidade (o app não coleta nada — tudo local).

## Gerar e subir (cada release)

```bash
./scripts/build-mas.sh
```

O script builda o `.app` **universal** (Intel + Apple Silicon) assinado com
Apple Distribution + App Sandbox (`src-tauri/entitlements/mas.plist`) e o
provisioning profile embutido, e assina o `.pkg` final com o certificado de
instalador → `dist-mas/Matemonstro-<versão>-mas.pkg`.

Depois: abra o **Transporter.app**, arraste o `.pkg`, "Entregar". O build
aparece no App Store Connect em ~15 min (TestFlight/Revisão).

**A cada nova versão**: suba `version` em `src-tauri/tauri.conf.json` e
`package.json` antes de rodar o script (a loja rejeita versão repetida).

## Diferenças do build da loja vs. o .dmg direto

| | .dmg direto (GitHub Releases) | Mac App Store |
|---|---|---|
| Sandbox | não | **sim** (obrigatório) |
| Vault padrão | `~/Documents/Matemonstro` | `~/Library/Containers/com.matemonstro.desktop/Data/Documents/Matemonstro` |
| "Trocar pasta" do vault | persiste | **vale só até fechar o app** (persistir exigiria security-scoped bookmarks — limitação conhecida do Tauri; ver nota) |
| Atualização | manual / updater futuro | automática pela loja |

Nota: sob sandbox, o acesso a uma pasta escolhida pelo usuário morre quando o
processo fecha. Para a v1 da loja isso é aceitável (o vault do container
funciona 100% e o export de vault .zip continua disponível); se a persistência
da pasta custom virar prioridade, o caminho é um plugin de security-scoped
bookmarks no core Rust.

## Revisão da Apple — pontos prováveis

- **Por que network.client?** Sync opcional futuro; o app funciona 100%
  offline. Se a revisão implicar, pode-se remover o entitlement na v1.
- **Conta/login**: o desktop não tem login (v1) — nada de "Sign in with Apple"
  exigível.
- **Conteúdo**: app educacional, sem UGC público, sem compras — revisão simples.
