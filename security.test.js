
const test = require("node:test");
const assert = require("node:assert/strict");

const baseURL = "http://127.0.0.1:3000";

const integrationURL =
    `${baseURL}/api/integrations/pipedrive-to-bling?dryRun=true&dealId=7`;

test("Bloqueia integração sem chave de API", async () => {
    const response = await fetch(integrationURL, {
        method: "POST"
    });

    assert.equal(response.status, 401);
});

test("Bloqueia chave de API incorreta", async () => {
    const response = await fetch(integrationURL, {
        method: "POST",
        headers: {
            "x-api-key": "chave-incorreta-teste"
        }
    });

    assert.equal(response.status, 401);
});

test("Rejeita OAuth sem state", async () => {
    const response = await fetch(
        `${baseURL}/api/bling/callback?code=teste`
    );

    assert.equal(response.status, 403);
});

test("Rejeita OAuth com state inválido", async () => {
    const response = await fetch(
        `${baseURL}/api/bling/callback?code=teste&state=invalido`
    );

    assert.equal(response.status, 403);
});

test("Rejeita OAuth sem cookie de autorização", async () => {
    const fakeState = "a".repeat(64);

    const response = await fetch(
        `${baseURL}/api/bling/callback?code=teste&state=${fakeState}`
    );

    assert.equal(response.status, 403);
});


const protectedRoutes = [
    "/api/pipedrive/deals/won",
    "/api/bling/orders",
    "/api/integrations/consolidated",
    "/api/bling/contacts"
];

for (const route of protectedRoutes) {
    test(`Bloqueia acesso sem chave: ${route}`, async () => {
        const response = await fetch(
            `http://127.0.0.1:3000${route}`
        );

        assert.equal(response.status, 401);
    });
}
