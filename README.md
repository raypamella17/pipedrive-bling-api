# Pipedrive Bling API
Projeto desenvolvido em Node.js para integrar oportunidades ganhas do Pipedrive com pedidos de venda no Bling.
## Objetivo
A aplicação busca oportunidades com status ganho no Pipedrive, transforma essas oportunidades em pedidos de venda e envia os dados para o Bling.
Fluxo principal:
- Pipedrive
- Buscar oportunidades ganhas
- API Node.js
- Criar pedido de venda
- Bling
## Tecnologias utilizadas
- Node.js
- Express
- Axios
- Dotenv
- API Pipedrive
- API Bling v3
- OAuth 2.0
## Funcionalidades
- Buscar oportunidades ganhas no Pipedrive.
- Autenticar aplicação no Bling usando OAuth 2.0.
- Gerar access token e refresh token do Bling.
- Buscar pedidos de venda no Bling.
- Buscar contatos no Bling.
- Criar pedido de venda no Bling a partir de uma oportunidade ganha do Pipedrive.
## Como rodar o projeto:
npm install
Rodar a API:
node app.js
A API fica disponível em:
http://localhost:3000
## Rotas principais
GET /
Testa se a API está funcionando.
GET /api/pipedrive/deals/won
Busca oportunidades ganhas no Pipedrive.
GET /api/bling/auth
Inicia a autorização do Bling.
GET /api/bling/orders
Busca pedidos de venda no Bling.
GET /api/bling/contacts
Busca contatos no Bling.
POST /api/integrations/pipedrive-to-bling
Busca uma oportunidade ganha no Pipedrive e cria um pedido de venda no Bling.
## Teste realizado
Foi criada uma oportunidade ganha no Pipedrive chamada Pedido teste API, com valor de R$ 100,00.
Depois da integração, foi criado um pedido de venda no Bling para o Cliente Teste, também no valor de R$ 100,00.
## Resultado
A integração inicial entre Pipedrive e Bling funcionou com sucesso.
A API conseguiu:
- Buscar uma oportunidade ganha no Pipedrive.
- Ler os dados da oportunidade.
- Montar um pedido de venda.
- Enviar o pedido para o Bling.
- Criar o pedido no Bling.
## Observações
Este projeto foi desenvolvido para fins de estudo e demonstração técnica.
Para uso em produção, seria necessário melhorar:
- Tratamento de erros.
- Validação dos dados.
- Evitar pedidos duplicados.
- Renovação automática do token do Bling.
- Persistência dos dados em banco de dados.
- Logs da integração.
- ## Persistência com MongoDB
Além de criar pedidos no Bling, a API também salva no MongoDB Atlas os dados da oportunidade enviada.

Dados salvos:
- ID da oportunidade no Pipedrive
- Título da oportunidade
- Valor
- Status
- Resposta do Bling
- Data da integração

## Endpoint de dados consolidados

GET /api/integrations/consolidated

Esse endpoint retorna os dados agrupados por dia, mostrando:
- Data
- Quantidade de oportunidades enviadas
- Valor total das oportunidades

Exemplo de resposta:

{
  "message": "Dados consolidados por dia",
  "data": [
    {
      "date": "2026-09-29",
      "totalOpportunities": 1,
      "totalValue": 100
    }
  ]
}
