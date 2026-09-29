# Anotações do projeto

## Objetivo do projeto

Criar uma API em Node.js para integrar o Pipedrive com o Bling.

A ideia principal é buscar oportunidades ganhas no Pipedrive e enviar essas oportunidades para o Bling como pedidos de venda.

## Tecnologias usadas

- Node.js
- Express
- Axios
- Dotenv
- API Pipedrive
- API Bling v3
- OAuth 2.0

## O que foi feito

- Criado projeto Node.js.
- Instalado Express, Axios e Dotenv.
- Criado arquivo `.env` para guardar credenciais.
- Criado arquivo `.env.example` com exemplos das variáveis.
- Criada rota para testar se a API está funcionando.
- Criada rota para buscar oportunidades ganhas no Pipedrive.
- Criada conta no Bling.
- Criado aplicativo privado no Bling.
- Configurado OAuth 2.0 do Bling.
- Gerado access token e refresh token.
- Criada rota para buscar pedidos de venda no Bling.
- Criada rota para buscar contatos no Bling.
- Criada rota principal para integrar Pipedrive com Bling.

## Rotas criadas

GET /

Testa se a API está funcionando.

GET /api/pipedrive/deals/won

Busca oportunidades ganhas no Pipedrive.

GET /api/bling/auth

Inicia a autorização do Bling.

GET /api/bling/callback

Recebe o código de autorização do Bling e gera os tokens.

GET /api/bling/orders

Busca pedidos de venda no Bling.

GET /api/bling/contacts

Busca contatos no Bling.

POST /api/integrations/pipedrive-to-bling

Busca uma oportunidade ganha no Pipedrive e cria um pedido de venda no Bling.

## Teste realizado

Foi criada uma oportunidade ganha no Pipedrive chamada Pedido teste API.

Valor da oportunidade:

R$ 100,00

Foi criado um cliente no Bling chamado Cliente Teste.

Depois, a rota POST /api/integrations/pipedrive-to-bling foi executada.

Resultado:

O pedido de venda foi criado com sucesso no Bling.

## Resultado final

A integração inicial funcionou.

A API conseguiu buscar a oportunidade ganha no Pipedrive e criar um pedido de venda no Bling.

## Pontos de melhoria

- Evitar criação de pedidos duplicados.
- Renovar automaticamente o token do Bling.
- Salvar histórico da integração em banco de dados.
- Melhorar tratamento de erros.
- Criar logs para acompanhar as integrações.
- Buscar dados reais do contato em vez de usar um ID fixo.