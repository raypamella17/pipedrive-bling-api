/**
 * Fluxo Pipedrive -> Bling com dependências injetadas para testes sem rede.
 * IMPORTANTE: exige o índice MongoDB UNIQUE em pipedriveDealId.
 * Em caso de resultado incerto no Bling, NÃO reenvia automaticamente.
 */
const { findExistingBlingOrder } = require("./integrationRules");

function createIntegrationHandler({ Integration, httpClient, env, logger = console }) {
    if (!Integration || !httpClient || !env) {
        throw new Error("Integration, httpClient e env são obrigatórios.");
    }

    return async function integratePipedriveToBling(req, res) {
        let processingIntegration = null;
        // A prévia é opt-in e executa exclusivamente operações de leitura.
        const dryRun = req?.query?.dryRun === "true";

        try {
            const companyDomain = env.PIPEDRIVE_COMPANY_DOMAIN;
            const pipedriveToken = env.PIPEDRIVE_API_TOKEN;
            const blingAccessToken = env.BLING_ACCESS_TOKEN;

            if (!companyDomain || !pipedriveToken || !blingAccessToken) {
                return res.status(400).json({
                    error: "Configure PIPEDRIVE_COMPANY_DOMAIN, PIPEDRIVE_API_TOKEN e BLING_ACCESS_TOKEN no .env"
                });
            }

            // A opção dealId permite escolher uma oportunidade dentre as primeiras 100
            // retornadas pelo Pipedrive, apenas durante a prévia.
            const requestedDealId = dryRun && req?.query?.dealId !== undefined
                ? Number(req.query.dealId)
                : null;
            if (requestedDealId !== null &&
                (!Number.isSafeInteger(requestedDealId) || requestedDealId <= 0)) {
                return res.status(400).json({ error: "dealId precisa ser um inteiro positivo." });
            }

            const pipedriveResponse = await httpClient.get(
                `https://${companyDomain}.pipedrive.com/api/v2/deals`,
                {
                    headers: { "x-api-token": pipedriveToken },
                    params: { status: "won", limit: dryRun ? 100 : 1 }
                }
            );

            const deals = pipedriveResponse.data?.data;
            if (!Array.isArray(deals)) {
                throw new Error("Resposta inesperada ao buscar oportunidades no Pipedrive.");
            }
            if (deals.length === 0) {
                return res.status(404).json({
                    error: "Nenhuma oportunidade ganha encontrada no Pipedrive"
                });
            }

            const deal = requestedDealId === null
                ? deals[0]
                : deals.find((item) => Number(item.id) === requestedDealId);
            if (!deal) {
                return res.status(404).json({
                    error: "Oportunidade não encontrada na primeira página de negócios ganhos."
                });
            }
            if (!Number.isSafeInteger(Number(deal.id)) || Number(deal.id) <= 0) {
                throw new Error("O Pipedrive não retornou um ID de oportunidade válido.");
            }

            const existingIntegration = await Integration.findOne({ pipedriveDealId: deal.id });
            if (existingIntegration) {
                if (dryRun) {
                    return res.status(200).json({
                        dryRun: true,
                        message: "Prévia: oportunidade já registrada no MongoDB.",
                        pipedriveDealId: deal.id,
                        syncStatus: existingIntegration.syncStatus ?? "legacy",
                        blingOrderId: existingIntegration.blingOrderId ?? null,
                        wouldAttemptCreate: false,
                        writesPerformed: false
                    });
                }
                if (["processing", "needs_review"].includes(existingIntegration.syncStatus)) {
                    return res.status(409).json({
                        message: existingIntegration.syncStatus === "processing"
                            ? "Esta oportunidade já está em processamento."
                            : "Esta oportunidade precisa de revisão antes de uma nova tentativa.",
                        pipedriveDealId: deal.id,
                        syncStatus: existingIntegration.syncStatus
                    });
                }

                // Registros legados anteriores a syncStatus representam integrações já salvas.
                return res.status(200).json({
                    message: "Esta oportunidade já foi integrada ao Bling.",
                    alreadyIntegrated: true,
                    pipedriveDealId: deal.id,
                    blingOrderId: existingIntegration.blingOrderId
                });
            }

            const today = new Date().toISOString().split("T")[0];
            const orderPayload = {
                numeroLoja: `PD-${deal.id}`,
                data: today,
                dataSaida: today,
                dataPrevista: today,
                contato: { id: 18420326561 }, // Mantém o contato usado na versão original.
                itens: [{
                    id: 0,
                    codigo: `PD-${deal.id}-${Date.now()}`,
                    unidade: "UN",
                    quantidade: 1,
                    valor: Number(deal.value) || 0,
                    valorLista: Number(deal.value) || 0,
                    descricao: deal.title || "Oportunidade Pipedrive"
                }],
                parcelas: [],
                observacoes: `Pedido criado automaticamente a partir da oportunidade ganha no Pipedrive. Deal ID: ${deal.id}. Criado em: ${new Date().toISOString()}`
            };

            if (dryRun) {
                // Sem criar reserva nem pedido: apenas consulta os pedidos existentes.
                const params = new URLSearchParams();
                params.append("numerosLojas[]", orderPayload.numeroLoja);
                const consulta = await httpClient.get(
                    "https://api.bling.com.br/Api/v3/pedidos/vendas",
                    {
                        params,
                        headers: { Authorization: `Bearer ${blingAccessToken}` }
                    }
                );
                const pedidoExistente = findExistingBlingOrder(
                    consulta.data?.data,
                    orderPayload.numeroLoja
                );
                return res.status(200).json({
                    dryRun: true,
                    message: "Prévia concluída, sem criar pedidos ou registros.",
                    pipedriveDealId: deal.id,
                    numeroLoja: orderPayload.numeroLoja,
                    existsInMongo: false,
                    existsInBling: Boolean(pedidoExistente),
                    blingOrderId: pedidoExistente?.id ?? null,
                    wouldAttemptCreate: !pedidoExistente,
                    writesPerformed: false
                });
            }

            // A criação com índice único é a reserva atômica: apenas uma requisição vence.
            processingIntegration = await Integration.create({
                pipedriveDealId: deal.id,
                title: deal.title,
                value: Number(deal.value) || 0,
                status: deal.status,
                syncStatus: "processing"
            });

            const parametros = new URLSearchParams();
            parametros.append("numerosLojas[]", orderPayload.numeroLoja);
            const consultaBling = await httpClient.get(
                "https://api.bling.com.br/Api/v3/pedidos/vendas",
                {
                    params: parametros,
                    headers: { Authorization: `Bearer ${blingAccessToken}` }
                }
            );

            const pedidoExistente = findExistingBlingOrder(
                consultaBling.data?.data,
                orderPayload.numeroLoja
            );

            if (pedidoExistente) {
                if (!pedidoExistente.id) {
                    throw new Error("Pedido encontrado no Bling sem identificador válido.");
                }
                processingIntegration.blingOrderId = String(pedidoExistente.id);
                processingIntegration.syncStatus = "completed";
                await processingIntegration.save();

                return res.status(200).json({
                    message: "Este pedido já existe no Bling.",
                    alreadyIntegrated: true,
                    blingOrderId: pedidoExistente.id
                });
            }

            const blingResponse = await httpClient.post(
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
            const blingOrderId = blingResponse.data?.data?.id;
            if (!blingOrderId) {
                throw new Error("O Bling não retornou o ID do pedido.");
            }

            processingIntegration.blingOrderId = String(blingOrderId);
            processingIntegration.blingResponse = blingResponse.data;
            processingIntegration.syncStatus = "completed";
            const savedIntegration = await processingIntegration.save();

            return res.status(201).json({
                message: "Oportunidade do Pipedrive enviada como pedido para o Bling",
                pipedriveDeal: {
                    id: deal.id,
                    title: deal.title,
                    value: deal.value,
                    status: deal.status
                },
                blingOrder: blingResponse.data,
                savedIntegration
            });
        } catch (error) {
            logger.error("Falha na integração:", {
                mensagem: error.message,
                httpStatus: error.response?.status,
                mongoCode: error.code
            });

            if (error.code === 11000) {
                return res.status(409).json({
                    message: "Esta oportunidade já está registrada ou em processamento.",
                    alreadyExists: true
                });
            }

            if (processingIntegration) {
                // Depois da reserva pode ter havido envio ao Bling.
                // Nunca repetir automaticamente uma operação de resultado incerto.
                try {
                    processingIntegration.syncStatus = "needs_review";
                    await processingIntegration.save();
                } catch (updateError) {
                    logger.error("Erro ao atualizar status da integração:", updateError.message);
                }
            }

            return res.status(500).json({
                error: "Erro ao integrar Pipedrive com Bling",
                syncStatus: processingIntegration ? "needs_review" : undefined,
                message: processingIntegration
                    ? "Verifique o pedido no Bling antes de tentar novamente."
                    : "Falha antes de reservar a oportunidade."
            });
        }
    };
}

module.exports = { createIntegrationHandler };
