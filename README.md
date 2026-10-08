# Pojav Studio

Painel de modpacks e backend para um único launcher Android baseado no Amethyst/Pojav. Publicar uma release atualiza o catálogo do aplicativo; não gera um APK por modpack. A instalação prepara arquivos, Minecraft e runtime antes de ativar a instância, e mantém a versão anterior. Jogar uma instância instalada não depende da nossa API.

## Executar localmente

Requisitos: Node 22 ou superior e Docker Desktop com containers Linux.

```powershell
npm ci
node scripts/setup.mjs
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis storage
npm run db:generate
npm run db:migrate
npm run admin:create -- seu-email@exemplo.com
npm run dev
```

Abra http://localhost:5173. O comando de administrador solicita uma senha, ou aceita `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente. Não há conta ou senha pública de acesso. A `.env` local não entra no Git. Os dados ficam em volumes Docker.

Para executar todo o painel em Docker, use `docker compose up -d --build`; abra http://localhost:8080. Crie o administrador com `docker compose exec api npm run admin:create -- seu-email@exemplo.com`. Nesse modo defina `WEB_ORIGIN=http://localhost:8080` na `.env`.

## Catálogo e importação

- Providers independentes: Modrinth, CurseForge e projetos locais. Pesquisa, versão do Minecraft, loader, categorias, ordenação e paginação ficam no backend.
- Modrinth consulta a API oficial e restringe pesquisas de pacotes a `project_type=modpack`.
- CurseForge exige `CURSEFORGE_API_KEY` na configuração do servidor. A chave não é enviada ao painel ou ao APK. Downloads negados permanecem pendentes; não há tentativa de contornar permissões.
- `.mrpack` interpreta índice, ambientes, dependências e prioridade dos overrides do cliente. Overrides de servidor não são instalados no Android. ZIP CurseForge interpreta o manifest oficial e resolve cada `projectID/fileID`.
- Arquivos externos são baixados temporariamente, verificados por hashes e tamanho, e descartados do backend. Downloads das releases continuam pela origem. Somente arquivos locais/overrides são hospedados; a publicação exige confirmação de distribuição.
- `.modpack.json` é o formato interno de metadados. Ao reimportar, blobs locais devem ser enviados novamente; o arquivo não concede acesso a objetos internos.
- Jobs BullMQ/Redis processam a importação fora da requisição HTTP, guardam progresso e arquivos verificados para retentativas e permitem cancelar.
- Projetos podem combinar fontes, personalizar nome/capa e adicionar/remover arquivos. Upstream é uma referência: verificar atualização e aplicar um diff são ações manuais. Conflitos exigem escolher a versão local ou upstream. Releases publicadas são imutáveis.

## Desempenho e Android

Mods de desempenho são **sugestões com instalação manual**, conforme a preferência escolhida. Não há instalação automática de Sodium, OptiFine ou outros mods. Compatibilidade com Minecraft/loader não equivale a compatibilidade com Android. Sodium informa que Android não é oficialmente suportado; teste o renderizador e evite combinar renderizadores concorrentes. Um perfil gráfico conservador separado pode ser ativado manualmente.

`ANDROID_VALIDATED_TARGETS` começa vazio. Depois de testar Minecraft, loader e sua versão em um aparelho, registre a combinação, por exemplo:

```dotenv
ANDROID_VALIDATED_TARGETS=[{"minecraft":"1.20.1","loader":"fabric","loaderVersion":"0.16.0"}]
```

Essa lista é uma declaração do operador de que realizou o teste; não produz uma homologação automática. A publicação permanece bloqueada para combinações que não constam nela.

O overlay em `integrations/amethyst/overlay` implementa biblioteca com capas persistidas, versões instaladas, atualização manual, instalação verificada em staging, rollback, cache do catálogo e controle de toque que detecta teclado físico. A conta Microsoft e a preparação dos arquivos do Minecraft continuam usando o launcher original. A biblioteca abre o perfil instalado no launcher original, onde o jogador inicia o jogo.

Erros oferecem uma prévia e perguntam antes do envio. O relatório usa `POST /api/v1/public/diagnostics`, exige `consent:true` e remove tokens, emails e caminhos pessoais. Logs podem conter outros dados: o jogador pode recusar. O painel mostra relatórios revisados/resolvidos, com retenção configurável, padrão 30 dias.

## APK único

O source do launcher é fixado por commit em `integrations/amethyst/launcher.lock.json`. `npm run launcher:prepare` busca o checkout e os submódulos sem modificar fontes existentes. A imagem `infra/Dockerfile.android` fornece JDK, SDK/NDK, Node e Gradle; a geração ocorre em worker separado.

Prepare uma chave de assinatura própria em `.data/secrets/studio.jks` e guarde uma cópia segura. Configure `APK_KEYSTORE_PASSWORD`, `APK_KEY_ALIAS` e `APK_KEY_PASSWORD`. O APK usa o endereço `PUBLIC_API_URL` e exige HTTPS. Não coloque credenciais de providers na assinatura ou no aplicativo.

```powershell
docker compose --profile android build android-worker
docker compose --profile android up -d android-worker
```

Defina `BUILD_ENABLED=true` também na API e reinicie-a para habilitar o botão **Gerar APK do launcher**. Cada build recebe `versionCode` crescente e seu hash SHA-256. A compilação do APK e os testes em hardware têm resultados registrados em `docs/VALIDATION.md`.

## Domínio e Cloudflare

Os exemplos de produção usam:

| Serviço | Endereço |
| --- | --- |
| Painel | `pojav.davidhenrique.dev.br` |
| API do launcher | `pojav-api.davidhenrique.dev.br` |
| Objetos próprios | `pojav-files.davidhenrique.dev.br` |

Use `.env.production.example` como referência, mantendo os segredos reais apenas em `.env`. PostgreSQL, Redis e SeaweedFS ficam na rede interna em produção. O armazenamento S3 usa URLs assinadas e buckets privados.

`infra/cloudflared.example.yml` e `compose.cloudflare.yaml` recebem UUID e credenciais de um tunnel autorizado na sua conta. Guarde `config.yml` e `credentials.json` em `.data/cloudflared`, que não entra no Git. A autorização do Cloudflare precisa ser feita pelo titular no link oficial gerado por `cloudflared tunnel login`. Nenhum registro DNS existente precisa ser substituído para criar os três subdomínios.

```powershell
docker compose -f compose.yaml -f compose.cloudflare.yaml up -d --build
```

O limite de upload do proxy Cloudflare pode ser menor que o limite do backend (512 MB). Até implementar upload em partes, importe arquivos grandes pelo acesso local ao painel. Imports do catálogo baixam o pacote no worker e não passam pelo upload do navegador.

## Verificação

```powershell
npm run typecheck
npm run build
npm test
node --import tsx tests/integration.mts
node --import tsx tests/browser.mts
```

Os dois últimos exigem API/worker/painel locais e infraestrutura rodando. O teste de integração consulta Modrinth real e remove registros temporários; o teste de navegador exige `npx playwright install chromium`. Não exigem chave CurseForge. Consulte os resultados e limitações em `docs/VALIDATION.md`.
