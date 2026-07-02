# Deploy — Docker + Cloudflare Tunnel

Guia ponta a ponta para colocar o Matemonstro no ar em qualquer VPS/máquina
com Docker, expondo via **Cloudflare Tunnel** (sem abrir porta nenhuma no
host e sem precisar de IP público/DNS tradicional).

## 0. Pré-requisitos

- Docker + Docker Compose v2 (`docker compose version`) instalados na máquina/VPS.
- Um domínio (ou subdomínio) gerenciado pela **Cloudflare** (plano free serve).
- Conta com acesso ao **Cloudflare Zero Trust** (dash.cloudflare.com → Zero Trust).

## 1. Criar o Tunnel no Cloudflare Zero Trust

1. Acesse **Zero Trust → Networks → Tunnels** e clique em **Create a tunnel**.
2. Escolha **Cloudflared** como conector.
3. Dê um nome (ex.: `matemonstro`) e clique em **Save tunnel**.
4. Na tela seguinte ("Install and run a connector"), escolha o ambiente
   **Docker**. A Cloudflare mostra um comando do tipo:

   ```
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoiXXXX...
   ```

   Você **não** vai rodar esse comando diretamente — só precisa copiar o
   valor depois de `--token` (a string longa `eyJ...`). Esse é o
   `TUNNEL_TOKEN`.
5. Clique em **Next**. Em **Public Hostname**, configure:
   - **Subdomain**: o que preferir (ex.: `app` para `app.seudominio.com`).
   - **Domain**: seu domínio já conectado à Cloudflare.
   - **Service Type**: `HTTP`.
   - **URL**: `localhost:8016` — o compose publica o app na porta **8016**
     do host (`ports: "8016:3000"`), e o `cloudflared` roda com
     `network_mode: host`, então `localhost:8016` dentro dele é exatamente
     essa porta.
   > Alternativa (se preferir não usar host networking, ex.: rodando o
   > compose em macOS/Windows): remova o `network_mode: host` do serviço
   > `cloudflared` no `docker-compose.yml` e use **URL `app:3000`** aqui —
   > o DNS interno do Compose resolve o nome do serviço.
6. Salve. A partir daqui o hostname público já está roteado para o tunnel;
   falta só o container `cloudflared` estar rodando com o token certo.

## 2. Configurar o `.env`

Na raiz do projeto (na máquina onde vai rodar o Docker):

```bash
cp .env.example .env
```

Edite `.env` e cole o `TUNNEL_TOKEN` copiado no passo 1.4. As demais
variáveis (`DB_PATH`) já vêm com um default que bate com o volume do
`docker-compose.yml` — normalmente não precisa mexer.

## 3. Build e subida

```bash
docker compose build
docker compose up -d
```

- O `docker compose build` compila o app em modo `standalone` (ver
  `Dockerfile`) — isso inclui compilar o binário nativo do `better-sqlite3`
  dentro da imagem (toolchain `python3/make/g++` instalada só no estágio de
  build; a imagem final de runtime não carrega esse toolchain).
- O serviço `app` sobe publicado em **`localhost:8016`** no host (mude com
  `APP_PORT` no `.env`), com healthcheck em `/api/health`.
- O serviço `cloudflared` conecta ao Cloudflare com o `TUNNEL_TOKEN` e faz o
  proxy do hostname público configurado no passo 1.5 para
  `http://localhost:8016` (ele roda em `network_mode: host`; só sobe depois
  do app passar no healthcheck).
- Teste local antes do tunnel: `curl http://localhost:8016/api/health`
  deve responder `{"ok":true,...}`.

Verifique os logs:

```bash
docker compose logs -f app
docker compose logs -f cloudflared
```

Se `cloudflared` conectou certo, os logs mostram algo como
`Registered tunnel connection` sem erros de autenticação. Acesse o hostname
público (`https://app.seudominio.com`) — deve responder à aplicação.

## 4. Persistência do banco (SQLite)

O SQLite mora dentro do volume nomeado `matemonstro-data`, montado em
`/data` no container `app` (`DB_PATH=/data/matemonstro.db`, WAL habilitado).
Esse volume **sobrevive** a `docker compose down`, `docker compose up
--build`, recriação do container, etc. Ele só é apagado se você rodar
`docker compose down -v` (cuidado com o `-v`) ou remover o volume
explicitamente.

### Backup

```bash
# Copia o arquivo do banco (e os companheiros do WAL) de dentro do volume
# para um .tar.gz local, sem precisar parar o container.
docker run --rm \
  -v matemonstro_matemonstro-data:/data \
  -v "$(pwd)":/backup \
  alpine \
  tar czf /backup/matemonstro-db-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

> O nome do volume no host tem o prefixo do projeto do Compose
> (`<nome-da-pasta>_matemonstro-data`). Rode `docker volume ls` para
> confirmar o nome exato se o comando acima não encontrar o volume.

### Restore

```bash
docker compose down
docker run --rm \
  -v matemonstro_matemonstro-data:/data \
  -v "$(pwd)":/backup \
  alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/matemonstro-db-backup-XXXXXXXX-XXXXXX.tar.gz -C /data"
docker compose up -d
```

## 5. Atualizando para uma nova versão

```bash
git pull
docker compose build
docker compose up -d
```

O volume `matemonstro-data` (e portanto o banco de usuários/estado/notas)
não é afetado por rebuilds — só muda o código da aplicação.

## 6. Rollback

Se algo quebrar, volte ao commit anterior e repita o passo 5
(`git checkout <commit-anterior> && docker compose build && docker compose
up -d`). O banco continua intacto porque vive no volume, fora da imagem.

## Referência rápida (comandos)

| Ação | Comando |
|---|---|
| Build | `docker compose build` |
| Subir | `docker compose up -d` |
| Parar | `docker compose down` (sem `-v`, preserva o volume) |
| Logs do app | `docker compose logs -f app` |
| Logs do tunnel | `docker compose logs -f cloudflared` |
| Shell no app | `docker compose exec app sh` |
| Listar volumes | `docker volume ls` |
