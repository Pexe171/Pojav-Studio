# Biblioteca pessoal

A partir do APK 1.0.13, abra **Explorar**, escolha Modrinth ou CurseForge, pesquise e selecione uma versão. **Adicionar versão** inicia a preparação em BullMQ/Redis. A biblioteca mostra o progresso e permite instalar quando a preparação termina. Esse fluxo não depende de publicação no painel administrativo.

O tema permanece escuro e roxo. A pesquisa oferece versão do Minecraft, loader, categorias, ordenação e paginação. Os detalhes permitem abrir a página da origem. Compatibilidade declarada pelo provider não comprova funcionamento no Android.

## Conta opcional

Um visitante recebe uma biblioteca privada sem preencher cadastro. Em **Minha conta**, criar uma conta com email e senha converte esse visitante em conta permanente, preservando os IDs dos perfis. Entrar em uma conta já existente troca a biblioteca; não mescla automaticamente bibliotecas de visitantes. Jogos instalados continuam no aparelho.

Essa conta é do Studio: login Microsoft e conta administrativa são independentes. A senha pode ser alterada com a senha atual, revogando sessões antigas. Não há confirmação de email nem recuperação de senha por email nesta versão. Sessões expiram em 90 dias. Para recuperar a biblioteca após reinstalar ou trocar de aparelho, crie uma conta antes e entre nela no outro aparelho.

São sincronizados referência do modpack e versão escolhida, nome do perfil, favorito, modo gráfico Leve/Equilibrado/Original e modo de controles de toque Automático/Mostrar/Ocultar. Mundos, arquivos locais e credenciais Minecraft não são enviados como parte dessa sincronização.

## Offline e conflitos

Uma instância já instalada pode ser usada sem nossa API. A biblioteca mantém cache por conta e alterações de preferências numa fila local. Ao voltar a conexão, **Mais → Sincronizar biblioteca** envia as alterações pendentes.

Cada alteração inclui uma revisão. Se outro aparelho alterou o mesmo perfil, a API responde com conflito e mantém a edição pendente. **Mais → Resolver sincronização** permite usar a versão da nuvem ou reaplicar explicitamente suas alterações. Isso não altera mundos.

Perfis publicados pelo painel e já instalados permanecem disponíveis localmente. **Salvar perfil na biblioteca** associa a release anterior à conta, sem criar outra instalação.

## Preparação e downloads

O backend pesquisa APIs oficiais, processa o pacote e produz uma release/manifest próprios e privados. Mods externos são resolvidos por metadados: o celular baixa das URLs autorizadas da origem e verifica hashes/tamanho. Credenciais CurseForge permanecem no servidor.

O pacote compactado é processado temporariamente; configurações e overrides necessários à release usam nosso armazenamento. Um mod JAR incorporado só é convertido para download externo se houver origem autorizada identificável; caso contrário, fica bloqueado. Permissões de autores e restrições dos providers continuam valendo.

Referências de origem são mantidas por perfil. Escolher outra versão não atualiza automaticamente instâncias existentes. Não há backup de mundos nesta versão.

## Isolamento e validação

Tokens aleatórios são armazenados como HMAC no backend e criptografados com Android Keystore no celular. Cada consulta de perfil e caminho de download privado valida o proprietário. Tokens de jogador não acessam administração; catálogos públicos omitem projetos pessoais. Cadastro, login, pesquisa e importação têm quotas.

`npm test` cobre contratos e regressões. `tests/players-integration.mjs` executa 29 verificações contra a API real com PostgreSQL e Redis, usando registros próprios e removendo-os ao terminar. Execute dentro da imagem da API com dependências em `/app`; leia o script antes de rodar em outro ambiente.

O APK foi compilado, assinado e baixado com hash conferido. Cadastro, login, preferências entre aparelhos, conflitos, instalação e uso offline pela nova interface aguardam confirmação no celular real. Não foi aberto emulador e não foi medida melhora de FPS.
