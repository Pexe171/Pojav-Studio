# Telemetria do launcher

O usuário precisa aceitar uma vez em **Relatórios automáticos**. O padrão é desativado. Depois do aceite, eventos de instalação, início/saída do jogo e trechos de logs seguem em segundo plano. A opção **Desativar e apagar fila** interrompe a coleta, cancela o job e remove os eventos locais pendentes; não apaga registros já recebidos pelo servidor.

Cada evento contém UUID, sessão, horário original, versão do launcher e, quando identificado, modpack e release. Modelo, versão do Android e arquitetura acompanham o lote. Um UUID aleatório identifica esta instalação; a API guarda somente seu HMAC com o segredo do servidor. Reinstalar ou limpar os dados pode mudar a identificação. Não coletamos IMEI, localização, sensores ou dados da conta Microsoft. Logs podem conter dados escritos por mods; a remoção de credenciais reconhecidas não garante anonimização de qualquer texto arbitrário.

Launcher e jogo executam em processos Android distintos. A coleta registra o ciclo de vida também no processo `:game`. Consentimento e identificação são compartilhados em arquivos privados; o identificador usa lock entre processos. Desativar o envio é observado pelo processo do jogo, mesmo com preferências antigas em memória. A retomada considera o PID salvo antes de marcar uma sessão como interrompida, evitando tratar um jogo ainda ativo como encerrado.

## Entrega e limites

- Fila no armazenamento privado do aplicativo: até 100 eventos, 5 MB e sete dias. Eventos antigos são descartados primeiro ao atingir os limites.
- Cada trecho de log tem até 16 KB. O aplicativo lê somente o final do arquivo, sem processamento por quadro; faz a primeira verificação 30 segundos após iniciar o jogo e depois a cada cinco minutos e na saída registrada.
- Um executor de baixa prioridade realiza escrita e envio. Lotes têm até dez eventos, com timeout de rede de cinco segundos. Erros de rede, 429 e falhas do servidor preservam o lote para reenvio. Respostas 400 descartam somente o lote inválido para ele não bloquear os seguintes.
- JobScheduler exige conexão e, em Android compatível, bateria suficiente; o sistema decide quando executar. Com o aplicativo em primeiro plano, há nova tentativa a cada cinco minutos. Forçar a parada do aplicativo pode suspender jobs até abri-lo novamente.
- A API confirma UUIDs aceitos. O cliente só remove eventos confirmados; reenvios após perder a resposta não criam novas linhas.
- API: 120 requisições por IP/hora, 60 lotes por aparelho/hora e 120 lotes globais/minuto. Limites globais diários: 5.000 eventos e 16 MB de dados recebidos. HTTP 429 permite tentativa posterior.
- Retenção no servidor: `DIAGNOSTIC_RETENTION_DAYS`, padrão 30 dias; limpeza horária pelo worker, pelo horário de recebimento.

O painel **Telemetria** permite filtrar aparelho, modpack e tipo, com paginação, horário original e horário de recebimento. Logs são exibidos como texto. A listagem exige sessão de administrador.

## API

`POST /api/v1/public/telemetry`, com `x-studio-request: 1`, recebe `{ consent: true, deviceId, device, events }`. `deviceId`, IDs dos eventos e sessões são UUIDs. `device` contém `model`, `android` e `architecture`. Eventos contêm `id`, `sessionId`, `kind`, `launcherVersion`, `occurredAt`, `data`, `log` e referências opcionais `projectId`/`releaseId`. A API valida a relação entre modpack e release, aceita datas dos últimos 30 dias e até um dia no futuro, remove credenciais reconhecidas e responde `{ accepted: [...] }`.

`GET /api/v1/telemetry?projectId=...&deviceKey=...&kind=...&offset=0` lista 25 eventos por página para o administrador. Nenhum arquivo de mod é enviado por este serviço.

Tipos: `telemetry-enabled`, `installation-start`, `installation-ready`, `installation-pending`, `installation-failed`, `launch-request`, `game-start`, `game-exit`, `game-log`, `session-interrupted`. A retomada de uma sessão sem saída registrada pode indicar fechamento pelo usuário ou Android; não comprova crash. Informações recebidas de clientes são relatos, não prova de identidade do aparelho.

Esta versão não mede FPS, temperatura ou consumo de memória continuamente. Não foi medido o impacto em desempenho no aparelho real. A confirmação final de envio offline, encerramento e agendamento no Moto G60s depende do teste no celular; nenhum emulador foi aberto.
