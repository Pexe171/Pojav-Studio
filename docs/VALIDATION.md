# Validação — 7 de outubro de 2026

Em 08/10/2026, o APK 1.0.4 foi compilado, baixado pelo Cloudflare com SHA-256 verificado e instalado por cima da versão anterior no BlueStacks. Com o perfil local existente, sem conta Microsoft cadastrada, o download oficial do Minecraft 26.3 iniciou e ultrapassou 110 MB de 560,48 MB. Esse teste confirma o desbloqueio do download; a conclusão da instalação e a execução dessa versão ainda não foram verificadas. SHA-256 do APK: `d022b568e5aee2af803c57d2459014b941e58446aad220e4735ed4175d7e46ac`.

Resultados obtidos neste ambiente Windows com Docker Desktop Linux:

- TypeScript: API, painel e modelo compartilhado passaram.
- Compilação de produção: API e painel passaram; imagens Docker da API e do painel foram construídas e executadas.
- 41 testes automatizados passaram: MRPACK, overrides cliente/servidor, ambientes opcionais, hashes, manifest CurseForge, proteção contra caminhos perigosos, deduplicação, atualização com conflitos, URLs externas, filtros Modrinth, downloads negados CurseForge e seleção de runtime Java para versões antigas/atuais do Minecraft.
- Integração real com PostgreSQL, Redis/BullMQ e SeaweedFS: autenticação, importação de MRPACK local, análise no worker, verificação de overrides, criação única do projeto, conflito de revisão, exportação e bloqueio de publicação de uma combinação Android não homologada passaram.
- Relatórios: ausência de consentimento foi rejeitada; envio consentido, remoção de tokens/email e marcação como resolvido passaram.
- Modrinth oficial: pesquisa real de Cobblemon e paginação sem repetição passaram.
- Chromium: login, catálogo desktop e mobile (390 px), navegação para launcher e relatórios passaram; nenhum erro JavaScript ou overflow mobile. Capturas locais em `.data/screenshots`.
- Cloudflare: titular autorizou o túnel `pojav-studio`. Publicação também foi explicitamente autorizada. HTTPS do painel, health e catálogo público retornaram 200; projetos sem sessão retornaram 401; bucket sem URL assinada retornou 403. Login do administrador e pesquisa Modrinth pelo domínio público passaram.

## Limites da validação

Não foi fornecida uma chave CurseForge. Seu contrato, filtros, normalização e recusa de download foram testados com respostas controladas; busca e importação autenticadas reais CurseForge continuam pendentes da configuração da chave.

O catálogo Android fica vazio até publicar uma release. `ANDROID_VALIDATED_TARGETS` permanece vazio, pois não há aparelho Android conectado. Nenhuma combinação Minecraft/loader foi declarada homologada sem teste. FPS, teclado físico, renderizadores, autenticação Microsoft, instalação/rollback e jogo offline precisam ser verificados em aparelho real.

A preparação do checkout Amethyst fixado e o overlay passaram. A compilação final `assembleRelease` passou com JDK 21 e 8, SDK 37.0 e os NDKs do upstream. O APK tem 130.991.575 bytes; assinatura v1 e v2 verificadas por apksigner. SHA-256: `c9c8120d39f7c0cf2f00eec7a156b3c8d8fdd1da1c7500ce3f64457c57250507`. O arquivo está em `artifacts/pojav-studio-1.apk`, fora do Git, e foi registrado no painel como o launcher inicial. Seu asset aponta à API HTTPS própria; uma busca nos conteúdos do APK confirmou que nenhuma senha de banco, storage, sessão, keystore ou administrador foi embutida. O lint do launcher upstream reportou erros de tradução não fatais, portanto não se declara lint limpo.

Publicação também foi testada em um banco temporário separado, com combinação fictícia de teste apenas nesse subprocesso: manifest próprio, runtime Java 17, release imutável, rejeição de revisão desatualizada, URL S3 assinada pelo domínio público e hash dos bytes baixados passaram. O banco e seus objetos foram removidos; essa execução não homologou nenhum aparelho nem adicionou packs ao catálogo de produção.

O fluxo de build em produção também passou: a API pública autenticada enfileirou o job, BullMQ acionou o worker Android, Gradle compilou o launcher e o backend armazenou o APK. O segundo APK (`versionCode=2`) foi baixado pelo Cloudflare e seu SHA-256 conferiu: `0cc213d0ef75e8fa9a4a69734344fe52a35029d0b2b2be3a9d68d0460f71ea28`. O arquivo local é `artifacts/pojav-studio-2.apk`. A geração de APK está habilitada no painel e o worker permanece ativo. O link público de download entrega o APK mais recente.

Uploads locais do navegador ainda não são divididos em partes: o limite do Cloudflare pode exigir importar um pacote grande pela conexão local. Cancelamento e retentativas de jobs estão implementados; recuperação após perda total do Redis não foi simulada.

O túnel depende de Docker e desta máquina ligados. Não foi migrado para uma VPS. Certificados, senhas, chave de assinatura, APKs e dados de teste ficam fora do Git.

Minecraft 26.1 usa Java 25, conforme as [notas oficiais da Mojang](https://feedback.minecraft.net/hc/en-us/articles/44551668333837-Minecraft-Java-Edition-26-1). A seleção de runtime contempla essa numeração; isso não é uma declaração de compatibilidade de renderizadores/mods no Android.
