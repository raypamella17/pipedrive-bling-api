
function findExistingBlingOrder(pedidos, numeroLoja) {
    if (!Array.isArray(pedidos)) {
        throw new Error(
            "Resposta inesperada ao consultar pedidos no Bling."
        );
    }

    return pedidos.find(
        pedido => pedido.numeroLoja === numeroLoja
    ) ?? null;
}

module.exports = { findExistingBlingOrder };
