# Validação — 8 de outubro de 2026

Perfil gráfico local do launcher: `Leve` é o padrão, com gráficos rápidos, renderização em 4 chunks, simulação em 5, limite de 30 FPS, partículas mínimas, mipmap zero, sem nuvens/sombras de entidades/iluminação suave e alcance menor de entidades. `Equilibrado` usa 6 chunks e 60 FPS. `Original` restaura somente as opções gráficas administradas, mantendo controles e alterações não relacionadas. O perfil aplica uma vez por escolha/release e preserva ajustes feitos dentro do jogo nas aberturas seguintes. O teste Java verifica formatos modernos/antigos, chaves duplicadas, restauração e rejeição de symlinks. Isso reduz a carga gráfica; não comprova tempo de carregamento nem resolve o erro de leitura do menu FancyMenu no Moto G60s. Nenhum mod de desempenho é instalado automaticamente.

O launcher passou a persistir uma instalação pendente depois de verificar todos os arquivos do modpack, antes de preparar Java/Minecraft e o loader. O catálogo mostra `Concluir instalação` nessa etapa. Ao retornar à biblioteca, ela sempre renderiza novamente e tenta finalizar a instalação quando o loader e o runtime estão disponíveis. A retomada usa a release original e reaproveita arquivos completos verificados, mesmo se houver uma release mais recente no catálogo. Instalações vanilla também podem ser retomadas. A confirmação final em aparelho real continua necessária; nenhum emulador foi aberto.

Relatórios de instalação do Moto G60s / Android 12 / launcher 1.0.6 apontaram `Falha ao criar diretório` em `StudioInstaller.download`. A criação da pasta compartilhada pelos downloads paralelos agora verifica novamente se a pasta existe quando `mkdirs` retorna falso. O teste Java reproduz deterministicamente essa disputa, executa 400 operações concorrentes e confirma que um arquivo existente não é aceito como diretório. Os relatórios foram marcados como revisados; a reinstalação no celular ainda precisa confirmar a resolução.

A auditoria do Pixelmon publicado confirmou 13 mods com distribuição `origin`, sem `storageKey`: o aparelho baixa esses mods diretamente da origem. Os 559 arquivos personalizados permanecem no armazenamento para servir a release. Downloads de verificação são temporários e removidos pelo importer; nenhuma pasta `studio-import-*` permaneceu no worker após as análises concluídas. Isso não altera a exigência de autorização para aumentar o limite de extração do Prominence II.

Recuperação de importações: 77 testes passaram, incluindo reconciliação de jobs interrompidos pelo BullMQ, retomada concorrente e falha do Redis. O painel publicado mostrou as três importações pendentes em viewport de celular, sem erro JavaScript ou overflow. Duas entradas correspondem ao mesmo Prominence II; não foram excluídas. Seu conteúdo incorporado tem 593.191.194 bytes e excede o limite padrão de 512 MB. O aumento do limite está pendente de autorização do operador. Medieval MC retomou a extração dos 1.450 arquivos incorporados. A fila agora registra interrupções como falhas visíveis e permite retomada manual.

APK 1.0.6 gerado pelo worker Android e baixado pelo domínio público com SHA-256 `52a6a46d269b61f016615bed19daac5485843e85cebd8f2cae294ec35f3c6ee3`. O endpoint público de versão informa versão instalada mínima 6. O launcher consulta silenciosamente ao abrir, retornar ao primeiro plano e a cada dois minutos enquanto está em primeiro plano. Quando a API informa uma versão obrigatória mais recente, apresenta a atualização; se a API falhar, permite continuar offline. É necessário instalar esta versão uma vez para ativar o mecanismo. Permissão de instalação e atualização no aparelho real ainda não foram verificadas.

A revisão de segurança passou com 70 testes automatizados e uma integração isolada contra a API real. Detalhes, correções e limites estão em [SECURITY.md](SECURITY.md).

Em 08/10/2026, o APK 1.0.4 foi compilado, baixado pelo Cloudflare com SHA-256 verificado e instalado por cima da versão anterior no BlueStacks. Com o perfil local existente, sem conta Microsoft cadastrada, o download oficial do Minecraft 26.3 iniciou e ultrapassou 110 MB de 560,48 MB. Esse teste confirma o desbloqueio do download; a conclusão da instalação e a execução dessa versão ainda não foram verificadas. SHA-256 do APK: `d022b568e5aee2af803c57d2459014b941e58446aad220e4735ed4175d7e46ac`.

Resultados obtidos neste ambiente Windows com Docker Desktop Linux:

- Em 08/10/2026, a página pública `/download` passou na verificação Playwright no domínio publicado em desktop e celular: links do APK corretos, sem login obrigatório, sem erro JavaScript e sem rolagem horizontal. O bloco de grama 3D respeita a preferência por movimento reduzido.
- A resolução em lote do Pixelmon entregou 573 URLs em 9 consultas e 3.960 ms: 14 arquivos no CDN do Modrinth e 559 arquivos personalizados no armazenamento do Studio. O teste isolado confirmou deduplicação de IDs, limite de 64 itens, rejeição de arquivo de outra release e download com hash correto.
- APK 1.0.5 compilado pelo worker e baixado pelo Cloudflare com SHA-256 `e7653fc2aef0dccf43c8d0a6e3694ac6aa531d29b128db5afac33be0586ee730`. O instalador usa quatro downloads simultâneos, reaproveita arquivos completos verificados e renova URLs quando a origem responde 401/403. O emulador permaneceu fechado a pedido do usuário; velocidade e instalação completas deste APK aguardam teste no celular.

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

O catálogo Android fica vazio até publicar uma release. A exigência de homologação prévia foi removida a pedido do operador em 08/10/2026: é possível publicar e depois instalar pelo aplicativo para testar. Isso não declara compatibilidade Android. FPS, teclado físico, renderizadores, autenticação Microsoft, instalação/rollback e jogo offline precisam ser verificados em aparelho real.

A preparação do checkout Amethyst fixado e o overlay passaram. A compilação final `assembleRelease` passou com JDK 21 e 8, SDK 37.0 e os NDKs do upstream. O APK tem 130.991.575 bytes; assinatura v1 e v2 verificadas por apksigner. SHA-256: `c9c8120d39f7c0cf2f00eec7a156b3c8d8fdd1da1c7500ce3f64457c57250507`. O arquivo está em `artifacts/pojav-studio-1.apk`, fora do Git, e foi registrado no painel como o launcher inicial. Seu asset aponta à API HTTPS própria; uma busca nos conteúdos do APK confirmou que nenhuma senha de banco, storage, sessão, keystore ou administrador foi embutida. O lint do launcher upstream reportou erros de tradução não fatais, portanto não se declara lint limpo.

Publicação também foi testada em um banco temporário separado, com combinação fictícia de teste apenas nesse subprocesso: manifest próprio, runtime Java 17, release imutável, rejeição de revisão desatualizada, URL S3 assinada pelo domínio público e hash dos bytes baixados passaram. O banco e seus objetos foram removidos; essa execução não homologou nenhum aparelho nem adicionou packs ao catálogo de produção.

O fluxo de build em produção também passou: a API pública autenticada enfileirou o job, BullMQ acionou o worker Android, Gradle compilou o launcher e o backend armazenou o APK. O segundo APK (`versionCode=2`) foi baixado pelo Cloudflare e seu SHA-256 conferiu: `0cc213d0ef75e8fa9a4a69734344fe52a35029d0b2b2be3a9d68d0460f71ea28`. O arquivo local é `artifacts/pojav-studio-2.apk`. A geração de APK está habilitada no painel e o worker permanece ativo. O link público de download entrega o APK mais recente.

Uploads locais do navegador ainda não são divididos em partes: o limite do Cloudflare pode exigir importar um pacote grande pela conexão local. Cancelamento e retentativas de jobs estão implementados; recuperação após perda total do Redis não foi simulada.

O túnel depende de Docker e desta máquina ligados. Não foi migrado para uma VPS. Certificados, senhas, chave de assinatura, APKs e dados de teste ficam fora do Git.

Minecraft 26.1 usa Java 25, conforme as [notas oficiais da Mojang](https://feedback.minecraft.net/hc/en-us/articles/44551668333837-Minecraft-Java-Edition-26-1). A seleção de runtime contempla essa numeração; isso não é uma declaração de compatibilidade de renderizadores/mods no Android.
