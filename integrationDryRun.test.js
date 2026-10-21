const test = require("node:test");
const assert = require("node:assert/strict");
const { createIntegrationHandler } = require("./integrationHandler");

function setup({ existing = null, blingOrders = [] } = {}) {
    const calls = { pipedrive: 0, blingGet: 0, blingPost: 0, create: 0, save: 0 };
    const deals = [
        { id: 7, title: "Pedido teste API", value: 100, status: "won" },
        { id: 8, title: "pedido teste apresentação", value: 150, status: "won" }
    ];
    const Integration = {
        async findOne({ pipedriveDealId }) {
            return Number(pipedriveDealId) === 7 ? existing : null;
        },
        async create() {
            calls.create++;
            throw new Error("NÃO deveria escrever no MongoDB durante a prévia.");
        }
    };
    const httpClient = {
        async get(url, config) {
            if (url.includes("pipedrive.com")) {
                calls.pipedrive++;
                assert.equal(config.params.limit, 100);
                return { data: { data: deals } };
            }
            if (url.includes("bling.com.br")) {
                calls.blingGet++;
                assert.equal(config.params.get("numerosLojas[]"), "PD-8");
                return { data: { data: blingOrders } };
            }
            throw new Error("URL inesperada");
        },
        async post() {
            calls.blingPost++;
            throw new Error("NÃO deveria criar pedidos durante a prévia.");
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

    async function run(query) {
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; }
        };
        await handler({ query }, res);
        return res;
    }
    return { run, calls };
}

test("Prévia do ID 7 já salvo: somente leitura do MongoDB", async () => {
    const s = setup({ existing: { pipedriveDealId: 7, blingOrderId: "26997462787" } });
    const res = await s.run({ dryRun: "true", dealId: "7" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.dryRun, true);
    assert.equal(res.body.wouldAttemptCreate, false);
    assert.equal(res.body.syncStatus, "legacy");
    assert.equal(s.calls.create, 0);
    assert.equal(s.calls.blingGet, 0);
    assert.equal(s.calls.blingPost, 0);
});

test("Prévia do ID 8 novo: consulta Bling, mas não grava nem cria pedido", async () => {
    const s = setup();
    const res = await s.run({ dryRun: "true", dealId: "8" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pipedriveDealId, 8);
    assert.equal(res.body.wouldAttemptCreate, true);
    assert.equal(res.body.writesPerformed, false);
    assert.equal(s.calls.blingGet, 1);
    assert.equal(s.calls.create, 0);
    assert.equal(s.calls.blingPost, 0);
});

test("Prévia do ID 8 já no Bling: não tentaria criar", async () => {
    const s = setup({ blingOrders: [{ id: 999, numeroLoja: "PD-8" }] });
    const res = await s.run({ dryRun: "true", dealId: "8" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.existsInBling, true);
    assert.equal(res.body.wouldAttemptCreate, false);
    assert.equal(s.calls.create, 0);
    assert.equal(s.calls.blingPost, 0);
});

test("Prévia com dealId inválido: rejeita antes de chamar APIs", async () => {
    const s = setup();
    const res = await s.run({ dryRun: "true", dealId: "invalid" });
    assert.equal(res.statusCode, 400);
    assert.equal(s.calls.pipedrive, 0);
    assert.equal(s.calls.blingGet, 0);
    assert.equal(s.calls.create, 0);
    assert.equal(s.calls.blingPost, 0);
});
