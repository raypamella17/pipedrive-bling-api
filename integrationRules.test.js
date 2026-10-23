
const test = require("node:test");
const assert = require("node:assert/strict");

const { findExistingBlingOrder } = require("./integrationRules");

// Teste 1: Pedido já existe
test("Deve identificar um pedido duplicado", () => {
    const pedidos = [
        { id: 100, numeroLoja: "PD-123" },
        { id: 101, numeroLoja: "PD-456" }
    ];

    const resultado = findExistingBlingOrder(pedidos, "PD-123");

    assert.equal(resultado.id, 100);
});

// Teste 2: Pedido não existe
test("Deve permitir identificar um pedido novo", () => {
    const pedidos = [
        { id: 100, numeroLoja: "PD-123" }
    ];

    const resultado = findExistingBlingOrder(pedidos, "PD-999");

    assert.equal(resultado, null);
});

// Teste 3: Resposta inválida
test("Deve rejeitar uma lista de pedidos inválida", () => {
    assert.throws(() => {
        findExistingBlingOrder(null, "PD-123");
    }, /Resposta inesperada/);
});
