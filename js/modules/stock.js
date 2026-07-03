/**
 * js/modules/stock.js
 * Gestão de stock: entradas, retiradas, disponibilidade por lote e alertas.
 */
import { COLS, criarDocumento, atualizarDocumento, obterDocumento, buscarPorCampo, listarColecao, registrarLog, ts, where } from "./db.js";

export async function obterStockDisponivel(tipoVacina = null) {
    let docs;
    if (tipoVacina) {
        docs = await buscarPorCampo(COLS.LOTES, "tipoVacina", tipoVacina);
    } else {
        docs = await listarColecao(COLS.LOTES);
    }

    return docs.map(l => ({
        id: l.id,
        tipoVacina: l.tipoVacina,
        numeroLote: l.numeroLote,
        validade: ts(l.validade),
        entradas: l.entradas || 0,
        retiradas: l.retiradas || 0,
        administradas: l.administradas || 0,
        disponivel: (l.entradas || 0) - (l.retiradas || 0) - (l.administradas || 0),
    }));
}

export async function obterStockAgregado(tipoVacina = null) {
    const stock = await obterStockDisponivel(tipoVacina);
    return stock.reduce((acc, l) => {
        if (!acc[l.tipoVacina]) acc[l.tipoVacina] = 0;
        acc[l.tipoVacina] += l.disponivel;
        return acc;
    }, {});
}

export async function entradaStock(tipoVacina, numeroLote, validade, quantidade, notas, operadorId) {
    const loteExistente = await buscarPorCampo(COLS.LOTES, "numeroLote", numeroLote);
    if (loteExistente.length > 0) {
        const lote = loteExistente[0];
        const novaEntrada = (lote.entradas || 0) + quantidade;
        await atualizarDocumento(COLS.LOTES, lote.id, { entradas: novaEntrada });
        await criarDocumento(COLS.MOVIMENTOS_STOCK, { loteId: lote.id, tipoVacina, tipo: "entrada", quantidade, motivo: null, notas, operadorId });
        await registrarLog(operadorId, "entrada_stock", COLS.LOTES, lote.id, { numeroLote, quantidade });
        return lote.id;
    }

    const loteId = await criarDocumento(COLS.LOTES, {
        tipoVacina,
        numeroLote,
        validade: new Date(validade),
        entradas: quantidade,
        retiradas: 0,
        administradas: 0,
    });

    await criarDocumento(COLS.MOVIMENTOS_STOCK, { loteId, tipoVacina, tipo: "entrada", quantidade, motivo: null, notas, operadorId });
    await registrarLog(operadorId, "criacao_lote", COLS.LOTES, loteId, { numeroLote, quantidade });
    return loteId;
}

export async function retiradaStock(loteId, motivo, quantidade, notas, operadorId) {
    const lote = await obterDocumento(COLS.LOTES, loteId);
    if (!lote) throw new Error("Lote não encontrado");

    const novaRetirada = (lote.retiradas || 0) + quantidade;
    await atualizarDocumento(COLS.LOTES, loteId, { retiradas: novaRetirada });
    await criarDocumento(COLS.MOVIMENTOS_STOCK, { loteId, tipoVacina: lote.tipoVacina, tipo: "retirada", quantidade, motivo, notas, operadorId });
    await registrarLog(operadorId, "retirada_stock", COLS.LOTES, loteId, { motivo, quantidade });
}

export async function administrarDose(loteId, quantidade, operadorId) {
    const lote = await obterDocumento(COLS.LOTES, loteId);
    if (!lote) throw new Error("Lote não encontrado");

    const novaAdm = (lote.administradas || 0) + quantidade;
    await atualizarDocumento(COLS.LOTES, loteId, { administradas: novaAdm });
}

export async function regressoStockGripe(loteId, quantidade, operadorId) {
    const lote = await obterDocumento(COLS.LOTES, loteId);
    if (!lote) throw new Error("Lote não encontrado");

    const novaAdm = Math.max(0, (lote.administradas || 0) - quantidade);
    await atualizarDocumento(COLS.LOTES, loteId, { administradas: novaAdm });
    await criarDocumento(COLS.MOVIMENTOS_STOCK, {
        loteId,
        tipoVacina: lote.tipoVacina,
        tipo: "regresso_stock",
        quantidade,
        motivo: "nao_administrada_gripe",
        notas: "Regresso automático de dose não administrada",
        operadorId,
    });
    await registrarLog(operadorId, "regresso_stock", COLS.LOTES, loteId, { quantidade });
}

export async function obterAgendadasPorTipo() {
    const agendamentos = await listarColecao(COLS.AGENDAMENTOS, [where("estado", "==", "Agendado")]);
    const totais = {};

    for (const ag of agendamentos) {
        for (const dose of (ag.vacinasAgendadas || [])) {
            if (dose.estadoDose !== "agendada") continue;
            totais[dose.tipoVacina] = (totais[dose.tipoVacina] || 0) + 1;
        }
    }

    return totais;
}

export async function obterAlertasSemStockAgendado() {
    const stock = await obterStockAgregado();
    const agendadas = await obterAgendadasPorTipo();
    const tipos = new Set([...Object.keys(stock), ...Object.keys(agendadas)]);
    const alertas = [];

    for (const tipo of tipos) {
        const disponivel = stock[tipo] || 0;
        const agendado = agendadas[tipo] || 0;
        if (agendado > disponivel) {
            alertas.push({
                tipo: "agendado_sem_stock",
                tipoVacina: tipo,
                disponivel,
                agendado,
                emFalta: agendado - disponivel,
                mensagem: `Agendadas ${agendado} vacinas de ${tipo} sem stock disponível (repor stock).`
            });
        }
    }

    return alertas;
}

export async function obterAlertas(diasValidade = 60, stockMinimo = 20) {
    const lotes = await listarColecao(COLS.LOTES);
    const agora = new Date();
    const limiteData = new Date(agora.getTime() + diasValidade * 86400000);
    const alertas = [];

    lotes.forEach(l => {
        const disp = (l.entradas || 0) - (l.retiradas || 0) - (l.administradas || 0);
        if (disp <= stockMinimo && disp > 0) {
            alertas.push({ tipo: "stock_baixo", lote: l.numeroLote, tipoVacina: l.tipoVacina, disponivel: disp });
        }
        const val = ts(l.validade);
        if (val && val <= limiteData) {
            alertas.push({ tipo: "validade_proxima", lote: l.numeroLote, tipoVacina: l.tipoVacina, validade: val });
        }
    });

    const alertasAgendadoSemStock = await obterAlertasSemStockAgendado();
    return [...alertas, ...alertasAgendadoSemStock];
}
