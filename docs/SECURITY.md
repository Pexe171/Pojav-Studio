# Revisão de segurança — 08/10/2026

A revisão incluiu autenticação administrativa, uploads, arquivos compactados, downloads externos, serviços Docker, pipeline e atualização do launcher. As correções foram publicadas; isso não substitui uma auditoria independente nem garante ausência de vulnerabilidades.

## Correções aplicadas

- Login limitado por conta, IP e volume global, com contadores e expiração atômicos no Redis. Até quatro verificações de senha simultâneas por processo evitam sobrecarga. Contas inexistentes também passam por verificação de hash, com mensagem genérica. Tentativas excessivas retornam 429 e `Retry-After`.
- Cookie de produção `__Host-studio_session`, Secure, HttpOnly, SameSite Strict, sem domínio compartilhado; proteção de origem/CSRF e respostas da API sem cache. Logout invalida a sessão.
- Painel com CSP, HSTS, bloqueio de frames e permissões de câmera, microfone e localização desativadas.
- Downloads rejeitam endereços privados, reservados e formatos IPv4/IPv6 perigosos. URLs e redirecionamentos de arquivos seguem a lista permitida. Requisições de metadata não seguem redirecionamentos, evitando encaminhar credenciais do provider.
- Uploads validam caminhos. Testes reais de ZIP cobrem traversal, links simbólicos, arquivos criptografados, duplicidade de caminhos e expansão excessiva. O limite padrão de expansão passou para 512 MB; é configurável até 4 GB para operadores que precisem de pacotes maiores.
- API e worker de importação executam como usuário sem privilégios, sem capabilities e sem aquisição de novos privilégios. Senhas de assinatura do APK não são fornecidas a esses dois processos. O worker Android continua responsável pela assinatura.
- CI usa permissões de leitura, ações oficiais fixadas por commit e checkout sem persistência de credenciais.
- Atualização do launcher valida HTTPS, host de download, tamanho, SHA-256, identificador do aplicativo, versão e certificado de assinatura antes de abrir o instalador Android. O sistema operacional confirma a instalação.

Os critérios de autenticação seguem o [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). As faixas especiais foram conferidas nos registros [IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry) e [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry) da IANA.

## Evidências

`npm test`: 70 testes passaram. A integração `tests/security-integration.mjs` passou contra a API real, com PostgreSQL separado e Redis DB 15: sessão falsa, acesso sem login, CSRF, entradas de SQL/NoSQL, limite por conta, concorrência, logout, uploads inválidos e endpoint público de versão. Nenhum administrador ou modpack de produção foi alterado por esse teste.

`npm audit`: nenhuma vulnerabilidade reportada. `node scripts/security-secrets.mjs artifacts/pojav-studio-6.apk` verificou os arquivos versionados e o conteúdo descompactado do APK contra os segredos reais do ambiente, sem encontrar exposição. A página pública passou na verificação Playwright em desktop e celular.

Para repetir a integração, crie previamente o banco temporário exclusivo `studio_security` e execute o script dentro da imagem da API, com PostgreSQL acessível como `postgres` e as dependências em `/app`. O script usa as credenciais de `DATABASE_URL`, mas troca o host e o banco para esses nomes e usa Redis DB 15. Não use esse banco nem esse Redis DB para dados reais; consulte o código antes de executar.

## Limites e operação

Não foi configurado segundo fator de autenticação nem uma política WAF específica no Cloudflare. O limite de tentativas pode impedir temporariamente um login legítimo sob ataque. Mods executam código no aparelho: esta revisão não audita todos os mods ou o launcher upstream.

A atualização exige conexão para conhecer a versão disponível. Falhas de rede/API liberam o uso offline de propósito. O APK 1.0.6 foi compilado, assinado e baixado pelo domínio público com hash conferido; o fluxo de permissão e instalação de atualização ainda precisa ser testado no celular real. O emulador permaneceu fechado.

Segredos locais ficam em `.env` e `.data`, fora do Git, e dependem da proteção da conta Windows. Permissões locais não foram alteradas. Preserve a chave de assinatura: sem ela, futuras versões não podem substituir as instalações existentes.
