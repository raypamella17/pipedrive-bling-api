const test = require("node:test");
const assert = require("node:assert/strict");
const { createIntegrationHandler } = require("./integrationHandler");

function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
}

function scenario(options = {}) {
    const records = new Map();
    const calls = { pipedrive: 0, blingGet: 0, blingPost: 0, save: 0 };
    let failedSave = false;

    function document(fields) {
        return {
            ...fields,
            async save() {
                calls.save++;
                if (options.failCompletedSaveOnce && this.syncStatus === "completed" && !failedSave) {
                    failedSave = true;
                    throw new Error("Falha simulada ao salvar no MongoDB");
                }
                records.set(this.pipedriveDealId, this);
                return this;
            }
        };
    }

    if (options.existing) {
        const record = document({ pipedriveDealId: 7, ...options.existing });
        records.set(7, record);
    }

    const Integration = {
        async findOne({ pipedriveDealId }) {
            if (options.forceMiss) return null;
            return records.get(Number(pipedriveDealId)) ?? null;
        },
        async create(fields) {
            if (records.has(Number(fields.pipedriveDealId))) {
                const error = new Error("E11000: duplicate key");
                error.code = 11000;
                throw error;
            }
            const record = document(fields);
            // Esta atribuição é síncrona antes de resolver o Promise: modela o índice UNIQUE.
            records.set(Number(fields.pipedriveDealId), record);
            return record;
        }
    };

    const httpClient = {
        async get(url, _config) {
            if (url.includes("pipedrive.com")) {
                calls.pipedrive++;
                return { data: { data: options.deals ?? [
                    { id: 7, title: "Venda de teste", value: 100, status: "won" }
                ] } };
            }
            if (url.includes("bling.com.br")) {
                calls.blingGet++;
                if (options.blingGetError) throw new Error("Bling temporariamente indisponível");
                return { data: { data: options.blingOrders === undefined ? [] : options.blingOrders } };
            }
            throw new Error(`Chamada inesperada: ${url}`);
        },
        async post(url, orderPayload, _config) {
            if (!url.includes("bling.com.br")) throw new Error("POST externo inesperado");
            assert.equal(orderPayload.numeroLoja, "PD-7");
            calls.blingPost++;
            options.postStarted?.resolve();
            if (options.waitPost) await options.waitPost.promise;
            if (options.blingPostError) throw new Error("Timeout simulado ao chamar o Bling");
            return { data: { data: options.postData ?? { id: 12345 } } };
        }
    };
    const handler = createIntegrationHandler({
        Integration,
        httpClient,
        env: {
            PIPEDRIVE_COMPANY_DOMAIN: "empresa-teste",
            PIPEDRIVE_API_TOKEN: "falso-para-teste",
            BLING_ACCESS_TOKEN: "falso-para-teste"
        },
        logger: { error() {} }
    });

    async function run() {
        const res = {
            statusCode: 200,
            status(n) { this.statusCode = n; return this; },
            json(data) { this.body = data; return this; }
        };
        await handler({}, res);
        return res;
    }

    return { run, calls, records };
}

test("Integração nova: reserva primeiro, conclui e envia um único pedido", async () => {
    const s = scenario();
    const res = await s.run();
    assert.equal(res.statusCode, 201);
    assert.equal(s.calls.blingPost, 1);
    assert.equal(s.records.get(7).syncStatus, "completed");
    assert.equal(s.records.get(7).blingOrderId, "12345");
    assert.equal(s.records.size, 1);
});

test("Oportunidade já integrada: não consulta nem envia pedido ao Bling", async () => {
    const s = scenario({ existing: { syncStatus: "completed", blingOrderId: "12345" } });
    const res = await s.run();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.alreadyIntegrated, true);
    assert.equal(s.calls.blingPost, 0);
    assert.equal(s.calls.blingGet, 0);
});

test("Registro antigo sem syncStatus também é considerado já integrado", async () => {
    const s = scenario({ existing: { blingOrderId: "12345" } });
    assert.equal((await s.run()).statusCode, 200);
    assert.equal(s.calls.blingPost, 0);
});

test("Oportunidade em processing: impede novo processamento", async () => {
    const s = scenario({ existing: { syncStatus: "processing" } });
    assert.equal((await s.run()).statusCode, 409);
    assert.equal(s.calls.blingPost, 0);
});

test("Oportunidade em needs_review: não reenviar automaticamente", async () => {
    const s = scenario({ existing: { syncStatus: "needs_review" } });
    assert.equal((await s.run()).statusCode, 409);
    assert.equal(s.calls.blingPost, 0);
});

test("Bling já possui o pedido: salva referência e não cria outro", async () => {
    const s = scenario({ blingOrders: [{ id: 551, numeroLoja: "PD-7" }] });
    const res = await s.run();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.blingOrderId, 551);
    assert.equal(s.records.get(7).syncStatus, "completed");
    assert.equal(s.calls.blingPost, 0);
});

test("Duas requisições simultâneas: apenas um POST é realizado", async () => {
    const postStarted = deferred();
    const waitPost = deferred();
    const s = scenario({ postStarted, waitPost });
    const first = s.run();
    await postStarted.promise;
    const second = await s.run();
    assert.equal(second.statusCode, 409);
    assert.equal(s.calls.blingPost, 1);
    waitPost.resolve();
    const result = await first;
    assert.equal(result.statusCode, 201);
    assert.equal(s.records.get(7).syncStatus, "completed");
});

test("Conflito no índice UNIQUE, mesmo após leitura desatualizada: HTTP 409", async () => {
    const s = scenario({ forceMiss: true, existing: { syncStatus: "completed" } });
    assert.equal((await s.run()).statusCode, 409);
    assert.equal(s.calls.blingPost, 0);
});

test("Timeout no POST Bling: marca needs_review e não repete envio", async () => {
    const s = scenario({ blingPostError: true });
    assert.equal((await s.run()).statusCode, 500);
    assert.equal(s.records.get(7).syncStatus, "needs_review");
    assert.equal((await s.run()).statusCode, 409);
    assert.equal(s.calls.blingPost, 1);
});

test("Erro na consulta ao Bling: marca needs_review, sem efetuar POST", async () => {
    const s = scenario({ blingGetError: true });
    assert.equal((await s.run()).statusCode, 500);
    assert.equal(s.records.get(7).syncStatus, "needs_review");
    assert.equal(s.calls.blingPost, 0);
});

test("Resposta inesperada do Bling: nunca presume que pode criar outro pedido", async () => {
    const s = scenario({ blingOrders: null });
    assert.equal((await s.run()).statusCode, 500);
    assert.equal(s.records.get(7).syncStatus, "needs_review");
    assert.equal(s.calls.blingPost, 0);
});

test("Falha ao salvar depois do POST: precisa de revisão sem segundo POST", async () => {
    const s = scenario({ failCompletedSaveOnce: true });
    assert.equal((await s.run()).statusCode, 500);
    assert.equal(s.records.get(7).syncStatus, "needs_review");
    assert.equal((await s.run()).statusCode, 409);
    assert.equal(s.calls.blingPost, 1);
});

test("Sem oportunidades ganhas: não reserva nem envia pedido", async () => {
    const s = scenario({ deals: [] });
    assert.equal((await s.run()).statusCode, 404);
    assert.equal(s.records.size, 0);
    assert.equal(s.calls.blingPost, 0);
});
