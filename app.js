require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { createIntegrationHandler } = require("./integrationHandler");

const app = express();

const PORT = 3000;

app.use(express.json());
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB conectado com sucesso!");
  })
  .catch((error) => {
    console.error("Erro ao conectar no MongoDB:", error.message);
  });

const integrationSchema = new mongoose.Schema({

pipedriveDealId: {
    type: Number,
    required: true,
    unique: true
},

  title: String,
  value: Number,
  status: String,
syncStatus: {
    type: String,
    enum: ["processing", "completed", "needs_review"]
},

  blingOrderId: String,
  blingResponse: Object,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Integration = mongoose.model("Integration", integrationSchema);
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

// O processamento fica em um módulo separado para testes sem Bling/MongoDB reais.
app.post("/api/integrations/pipedrive-to-bling", createIntegrationHandler({
    Integration,
    httpClient: axios,
    env: process.env
}));

app.get("/api/integrations/consolidated", async (req, res) => {
  try {
    const consolidated = await Integration.aggregate([
      // Não somar pedidos ainda em processamento ou aguardando revisão.
      // Documentos antigos sem syncStatus são mantidos no consolidado.
      {
        $match: {
          $or: [
            { syncStatus: "completed" },
            { syncStatus: { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          totalOpportunities: { $sum: 1 },
          totalValue: { $sum: "$value" }
        }
      },
      {
        $sort: {
          _id: -1
        }
      }
    ]);

    res.json({
      message: "Dados consolidados por dia",
      data: consolidated.map((item) => ({
        date: item._id,
        totalOpportunities: item.totalOpportunities,
        totalValue: item.totalValue
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar dados consolidados",
      details: error.message
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