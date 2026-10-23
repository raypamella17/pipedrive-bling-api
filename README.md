# Pipedrive ↔ Bling API | Versão 2.0

API RESTful desenvolvida com **Node.js, Express e MongoDB** para integrar oportunidades ganhas no Pipedrive a pedidos de venda no Bling. Projeto pessoal de estudo e portfólio, com foco em **integração de APIs, prevenção de duplicidades, tratamento de falhas e testes automatizados**.

> **Status:** versão de desenvolvimento/portfólio. A integração e as proteções foram validadas por testes simulados e por consultas reais às plataformas. Não é uma aplicação homologada para produção.

## Tecnologias

- Node.js 24 e Express 5
- Axios para requisições HTTP
- MongoDB Atlas e Mongoose
- Pipedrive API e Bling API v3 (OAuth 2.0)
- Test runner nativo do Node.js (`node:test`)
- Git e GitHub

## Fluxo da integração

1. A API consulta uma oportunidade com status `won` no Pipedrive.
2. Verifica se a oportunidade já foi registrada no MongoDB.
3. Reserva o ID da oportunidade na coleção `integrations`, com estado `processing` e índice único em `pipedriveDealId`.
4. Consulta o Bling pelo identificador `numeroLoja` (`PD-<id>`), evitando reenviar pedidos já encontrados.
5. Se necessário, solicita a criação do pedido no Bling e marca a integração como `completed`.
6. Em situações de resultado incerto, mantém o registro em `needs_review`, evitando tentativas automáticas que possam duplicar pedidos.

O **índice único** protege contra reservas duplicadas no MongoDB. Ele **não substitui** uma garantia de idempotência fornecida pelo Bling: uma falha entre a criação externa e a persistência local ainda requer reconciliação.

## Funcionalidades da versão 2.0

- Busca de oportunidades ganhas e integração com pedidos de venda.
- Persistência de registros e endpoint de consolidação diária (quantidade e valor).
- Consulta para detectar integrações e pedidos existentes.
- Estados `processing`, `completed` e `needs_review`.
- Modo **dry run**, para visualizar o resultado sem criar pedidos nem gravar novas integrações.
- Autenticação por cabeçalho `x-api-key` nas rotas de consulta e integração.
- Validação do parâmetro aleatório `state` no callback OAuth do Bling.
- Rotina de autorização OAuth iniciada apenas localmente no ambiente de desenvolvimento.
- Código de integração modularizado e testes com serviços simulados.

## Como executar localmente

**Pré-requisitos:** Node.js 24, acesso configurado ao MongoDB Atlas, conta Pipedrive com API disponível e aplicação do Bling cadastrada.

```bash
npm ci
```

Copie `.env.example` para `.env` e preencha as variáveis com credenciais **suas**, sem publicá-las:

```text
PIPEDRIVE_COMPANY_DOMAIN
PIPEDRIVE_API_TOKEN
BLING_CLIENT_ID
BLING_CLIENT_SECRET
BLING_REDIRECT_URI
BLING_ACCESS_TOKEN
BLING_REFRESH_TOKEN
MONGODB_URI
INTEGRATION_API_KEY
NODE_ENV
```

Gere `INTEGRATION_API_KEY` com um valor aleatório forte (por exemplo, 32 bytes) e mantenha-o fora do repositório. Verifique no MongoDB Atlas se o IP de desenvolvimento está autorizado e se o índice único `pipedriveDealId_1` está ativo na coleção `integrations`.

```bash
npm start
```

A API será servida em `http://localhost:3000`. A rota `GET /` é um teste público básico de disponibilidade.

A autorização inicial do Bling começa em `http://localhost:3000/api/bling/auth` no navegador local. O callback `/api/bling/callback` valida o `state` antes da troca do código por tokens. Os tokens são gravados no `.env` pela implementação atual; reinicie a aplicação após uma nova autorização para recarregá-los.

## Rotas

| Método | Rota | Finalidade | Requer `x-api-key` |
|---|---|---|---|
| GET | `/` | Verificação básica do servidor | Não |
| GET | `/api/pipedrive/deals/won` | Consultar oportunidades ganhas | Sim |
| GET | `/api/bling/auth` | Iniciar OAuth do Bling (somente local em desenvolvimento) | Restrição local |
| GET | `/api/bling/callback` | Receber callback OAuth e validar `state` | Validação OAuth |
| GET | `/api/bling/orders` | Consultar pedidos no Bling | Sim |
| GET | `/api/bling/contacts` | Consultar contatos no Bling | Sim |
| GET | `/api/integrations/consolidated` | Total diário e valor agregado | Sim |
| POST | `/api/integrations/pipedrive-to-bling` | Processar uma oportunidade ganha | Sim |

### Prévia segura (dry run)

Com a API em execução, envie uma requisição **POST** autenticada para:

```text
/api/integrations/pipedrive-to-bling?dryRun=true&dealId=7
```

O modo `dryRun=true` realiza somente consultas e retorna informações como `existsInMongo`, `existsInBling`, `wouldAttemptCreate` e `writesPerformed: false`. O parâmetro `dealId` permite selecionar uma oportunidade dentre as **primeiras 100** oportunidades ganhas retornadas pelo Pipedrive, apenas na prévia.

> **Cuidado:** remover `dryRun=true` faz a rota seguir o fluxo real, que **pode criar um pedido no Bling**. Não faça essa chamada sem uma oportunidade de teste controlada.

## Testes

Os testes unitários e de fluxo simulados **não precisam de acesso às APIs reais**:

```bash
npm test
```

São **20 testes** de regras e fluxo de integração. Outros **9 testes de segurança** foram executados localmente com o servidor rodando; para repeti-los, inicie `npm start` em um terminal e, em outro:

```bash
npm run test:security
```

No desenvolvimento da versão 2.0, **29 testes passaram**, incluindo os de segurança. O GitHub Actions executa apenas os testes isolados (`npm test`), sem acessar Pipedrive, Bling ou MongoDB.

## Estrutura principal

```text
app.js                       # Express, rotas e persistência
integrationHandler.js        # Fluxo Pipedrive → Bling e dry run
integrationRules.js          # Regras de verificação de pedidos
integrationHandler.test.js   # Testes do fluxo
integrationRules.test.js     # Testes das regras
integrationDryRun.test.js    # Testes de simulação
security.test.js             # Testes HTTP (requer servidor local)
```

## Limitações e próximos passos

A versão atual demonstra conceitos importantes de Back-End, mas ainda possui limitações conhecidas:

- O fluxo normal busca apenas **uma oportunidade ganha por execução**; paginação e sincronização em lote ainda não foram implementadas.
- O payload usa um **ID de contato de teste fixo** no Bling; o mapeamento automático de clientes é futuro.
- A renovação do token do Bling ainda **não é automática**.
- A recuperação de integrações com `needs_review` exige análise e reconciliação manual.
- O início do OAuth está limitado ao desenvolvimento local; uma versão pública precisaria de autenticação administrativa, armazenamento seguro de tokens e controles adicionais.
- É necessário ampliar testes de ponta a ponta em ambiente controlado antes de usar o projeto com vendas reais.

## Segurança

**Nunca publique** `.env`, tokens, senhas, URIs do MongoDB com credenciais ou dados pessoais de clientes. O arquivo `.env.example` contém apenas valores de exemplo. Em uma implantação pública, utilize HTTPS, controle de permissões, gestão segura de segredos e proteção contra abuso.

---

Projeto pessoal desenvolvido para consolidar conhecimentos de **desenvolvimento Back-End e integração entre sistemas**.
