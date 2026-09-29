require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Pipedrive + Bling API funcionando!"
    });
});

app.get("/api/pipedrive/deals/won", async (req, res) => {
    try {
        const companyDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN;
        const apiToken = process.env.PIPEDRIVE_API_TOKEN;

        if (!companyDomain || !apiToken) {
            return res.status(400).json({
                error: "Configure PIPEDRIVE_COMPANY_DOMAIN e PIPEDRIVE_API_TOKEN no arquivo .env"
            });
        }

        const url = `https://${companyDomain}.pipedrive.com/api/v2/deals`;

        const response = await axios.get(url, {
            headers: {
                "x-api-token": apiToken
            },
            params: {
                status: "won",
                limit: 100
            }
        });

const deals = response.data.data.map((deal) => {
    return {
        id: deal.id,
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        status: deal.status,
        personId: deal.person_id,
        organizationId: deal.org_id,
        wonTime: deal.won_time
    };
});

res.json({
    message: "Oportunidades ganhas buscadas no Pipedrive",
    total: deals.length,
    deals: deals
});
    } catch (error) {
        res.status(500).json({
            error: "Erro ao buscar oportunidades no Pipedrive",
            details: error.response?.data || error.message
        });
    }
});
app.get("/api/bling/auth", (req, res) => {
    const clientId = process.env.BLING_CLIENT_ID;

    if (!clientId) {
        return res.status(400).json({
            error: "Configure BLING_CLIENT_ID no arquivo .env"
        });
    }

    const state = "pipedrive-bling-api";
    const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&state=${state}`;

    res.redirect(authUrl);
});

app.get("/api/bling/callback", async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({
                error: "Código de autorização não recebido pelo Bling"
            });
        }

        const clientId = process.env.BLING_CLIENT_ID;
        const clientSecret = process.env.BLING_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return res.status(400).json({
                error: "Configure BLING_CLIENT_ID e BLING_CLIENT_SECRET no arquivo .env"
            });
        }

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const response = await axios.post(
            "https://www.bling.com.br/Api/v3/oauth/token",
            new URLSearchParams({
                grant_type: "authorization_code",
                code: code
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": `Basic ${credentials}`
                }
            }
        );
const envPath = path.join(__dirname, ".env");

let envFile = fs.readFileSync(envPath, "utf8");

envFile = envFile
    .replace(/^BLING_ACCESS_TOKEN=.*$/m, `BLING_ACCESS_TOKEN=${response.data.access_token}`)
    .replace(/^BLING_REFRESH_TOKEN=.*$/m, `BLING_REFRESH_TOKEN=${response.data.refresh_token}`);

fs.writeFileSync(envPath, envFile, "utf8");
        res.json({
            message: "Autorização do Bling realizada com sucesso",
            tokenType: response.data.token_type,
            expiresIn: response.data.expires_in,
            hasAccessToken: !!response.data.access_token,
            hasRefreshToken: !!response.data.refresh_token,
            nextStep: "Tokens gerados e salvos automaticamente no arquivo .env"
        });

    } catch (error) {
        res.status(500).json({
            error: "Erro ao autorizar aplicativo no Bling",
            details: error.response?.data || error.message
        });
    }
});

app.get("/api/bling/orders", async (req, res) => {
    try {
        const accessToken = process.env.BLING_ACCESS_TOKEN;

        if (!accessToken) {
            return res.status(400).json({
                error: "Configure BLING_ACCESS_TOKEN no arquivo .env"
            });
        }

        const response = await axios.get("https://api.bling.com.br/Api/v3/pedidos/vendas", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            },
            params: {
                limite: 10
            }
        });

        res.json({
            message: "Pedidos de venda buscados no Bling",
            data: response.data
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro ao buscar pedidos de venda no Bling",
            details: error.response?.data || error.message
        });
    }
});

app.post("/api/integrations/pipedrive-to-bling", async (req, res) => {
    try {
        const companyDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN;
        const pipedriveToken = process.env.PIPEDRIVE_API_TOKEN;
        const blingAccessToken = process.env.BLING_ACCESS_TOKEN;

        if (!companyDomain || !pipedriveToken || !blingAccessToken) {
            return res.status(400).json({
                error: "Configure PIPEDRIVE_COMPANY_DOMAIN, PIPEDRIVE_API_TOKEN e BLING_ACCESS_TOKEN no .env"
            });
        }

        const pipedriveUrl = `https://${companyDomain}.pipedrive.com/api/v2/deals`;

        const pipedriveResponse = await axios.get(pipedriveUrl, {
            headers: {
                "x-api-token": pipedriveToken
            },
            params: {
                status: "won",
                limit: 1
            }
        });

        const deals = pipedriveResponse.data.data;

        if (!deals || deals.length === 0) {
            return res.status(404).json({
                error: "Nenhuma oportunidade ganha encontrada no Pipedrive"
            });
        }

        const deal = deals[0];

        const today = new Date().toISOString().split("T")[0];

        const orderPayload = {
    numeroLoja: `PD-${deal.id}`,
    data: today,
    dataSaida: today,
    dataPrevista: today,
    contato: {
        id: 18420326561
    },
    itens: [
        {
            id: 0,
            codigo: `PD-${deal.id}`,
                    unidade: "UN",
                    quantidade: 1,
                    valor: Number(deal.value) || 0,
                    valorLista: Number(deal.value) || 0,
                    descricao: deal.title || "Oportunidade Pipedrive"
                }
            ],
            parcelas: [],
            observacoes: `Pedido criado automaticamente a partir da oportunidade ganha no Pipedrive. Deal ID: ${deal.id}`
        };

        const blingResponse = await axios.post(
            "https://api.bling.com.br/Api/v3/pedidos/vendas",
            orderPayload,
            {
                headers: {
                    Authorization: `Bearer ${blingAccessToken}`,
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            }
        );

        res.status(201).json({
            message: "Oportunidade do Pipedrive enviada como pedido para o Bling",
            pipedriveDeal: {
                id: deal.id,
                title: deal.title,
                value: deal.value,
                status: deal.status
            },
            blingOrder: blingResponse.data
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro ao integrar Pipedrive com Bling",
            details: error.response?.data || error.message
        });
    }
});
app.get("/api/bling/contacts", async (req, res) => {
    try {
        const accessToken = process.env.BLING_ACCESS_TOKEN;

        if (!accessToken) {
            return res.status(400).json({
                error: "Configure BLING_ACCESS_TOKEN no arquivo .env"
            });
        }

        const response = await axios.get("https://api.bling.com.br/Api/v3/contatos", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            },
            params: {
                nome: "Cliente Teste",
                limite: 10
            }
        });

        const contacts = response.data.data.map((contact) => {
            return {
                id: contact.id,
                nome: contact.nome,
                tipo: contact.tipo
            };
        });

        res.json({
            message: "Contatos buscados no Bling",
            contacts: contacts
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro ao buscar contatos no Bling",
            details: error.response?.data || error.message
        });
    }
});
app.listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
});