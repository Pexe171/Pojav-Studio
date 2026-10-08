# Validação — 7 de outubro de 2026

Resultados obtidos neste ambiente Windows com Docker Desktop Linux:

- TypeScript: API, painel e modelo compartilhado passaram.
- Compilação de produção: API e painel passaram; imagens Docker da API e do painel foram construídas e executadas.
- 35 testes automatizados passaram: MRPACK, overrides cliente/servidor, ambientes opcionais, hashes, manifest CurseForge, proteção contra caminhos perigosos, deduplicação, atualização com conflitos, URLs externas, filtros Modrinth e downloads negados CurseForge.
- Integração real com PostgreSQL, Redis/BullMQ e SeaweedFS: autenticação, importação de MRPACK local, análise no worker, verificação de overrides, criação única do projeto, conflito de revisão, exportação e bloqueio de publicação de uma combinação Android não homologada passaram.
- Relatórios: ausência de consentimento foi rejeitada; envio consentido, remoção de tokens/email e marcação como resolvido passaram.
- Modrinth oficial: pesquisa real de Cobblemon e paginação sem repetição passaram.
- Chromium: login, catálogo desktop e mobile (390 px), navegação para launcher e relatórios passaram; nenhum erro JavaScript ou overflow mobile. Capturas locais em `.data/screenshots`.
- Cloudflare: titular autorizou o túnel `pojav-studio`. Publicação também foi explicitamente autorizada. HTTPS do painel, health e catálogo público retornaram 200; projetos sem sessão retornaram 401; bucket sem URL assinada retornou 403. Login do administrador e pesquisa Modrinth pelo domínio público passaram.

## Limites da validação

Não foi fornecida uma chave CurseForge. Seu contrato, filtros, normalização e recusa de download foram testados com respostas controladas; busca e importação autenticadas reais CurseForge continuam pendentes da configuração da chave.

O catálogo Android fica vazio até publicar uma release. `ANDROID_VALIDATED_TARGETS` permanece vazio, pois não há aparelho Android conectado. Nenhuma combinação Minecraft/loader foi declarada homologada sem teste. FPS, teclado físico, renderizadores, autenticação Microsoft, instalação/rollback e jogo offline precisam ser verificados em aparelho real.

A preparação do checkout Amethyst fixado e o overlay passaram. A primeira compilação detectou a exigência adicional de JDK 8 do MioLibPatcher; o Dockerfile foi corrigido para oferecer JDK 21 e 8. O resultado final do APK será registrado após a compilação concluir.

Uploads locais do navegador ainda não são divididos em partes: o limite do Cloudflare pode exigir importar um pacote grande pela conexão local. Cancelamento e retentativas de jobs estão implementados; recuperação após perda total do Redis não foi simulada.

O túnel depende de Docker e desta máquina ligados. Não foi migrado para uma VPS. Certificados, senhas, chave de assinatura, APKs e dados de teste ficam fora do Git.
