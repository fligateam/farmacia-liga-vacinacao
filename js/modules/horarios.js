/**
 * js/modules/horarios.js
 * Gestão de horários, capacidade diária e vagas por vacina.
 */
import { COLS, criarDocumento, atualizarDocumento, buscarPorCampo, listarColecao, registrarLog, where } from "./db.js";

export async function obterConfigDia(dia) {
    const docs = await buscarPorCampo(COLS.CONFIG_HORARIOS, "dia", dia);
    return docs.length > 0 ? docs[0] : null;
}

export async function obterConfigMes(ano, mes) {
    const inicio = new Date(ano, mes, 1);
    const fim = new Date(ano, mes + 1, 0);
    const constraints = [where("dia", ">=", inicio), where("dia", "<=", fim)];
    return await listarColecao(COLS.CONFIG_HORARIOS, constraints);
}

export async function guardarConfigDia(dia, dados, operadorId) {
    const existente = await obterConfigDia(dia);
    if (existente) {
        await atualizarDocumento(COLS.CONFIG_HORARIOS, existente.id, dados);
        await registrarLog(operadorId, "atualizar_horario", COLS.CONFIG_HORARIOS, existente.id, { dia, dados });
    } else {
        const id = await criarDocumento(COLS.CONFIG_HORARIOS, { dia: new Date(dia), ...dados });
        await registrarLog(operadorId, "criar_horario", COLS.CONFIG_HORARIOS, id, { dia, dados });
    }
}

export async function bloquearDia(dia, operadorId) {
    await guardarConfigDia(dia, { aberto: false, vagas: { gripe: 0, covid: 0, gripe_contingente: 0 }, horarioInicio: null, horarioFim: null }, operadorId);
}

export async function obterVagasDisponiveis(dia, tipoVacina) {
    const config = await obterConfigDia(dia);
    if (!config || !config.aberto) return 0;
    const limite = config.vagas?.[tipoVacina] || 0;
    const ocupadas = config.vagasOcupadas?.[tipoVacina] || 0;
    return Math.max(0, limite - ocupadas);
}

export async function obterVagasDia(dia) {
    const config = await obterConfigDia(dia);
    if (!config || !config.aberto) return { gripe: 0, covid: 0, gripe_contingente: 0, bloqueado: true };
    const result = {};
    for (const tipo of ["gripe", "covid", "gripe_contingente"]) {
        const limite = config.vagas?.[tipo] || 0;
        const ocupadas = config.vagasOcupadas?.[tipo] || 0;
        result[tipo] = Math.max(0, limite - ocupadas);
    }
    result.bloqueado = false;
    return result;
}
