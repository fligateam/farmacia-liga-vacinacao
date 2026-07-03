/**
 * js/modules/horarios.js
 * Gestão de horários, capacidade diária e vagas por vacina.
 */
import { COLS, criarDocumento, atualizarDocumento, buscarPorCampo, listarColecao, registrarLog, where } from "./db.js";

function normalizarDia(dia) {
    if (!dia) return null;

    if (typeof dia === "string") {
        const [ano, mes, diaNum] = dia.slice(0, 10).split("-").map(Number);
        return new Date(ano, mes - 1, diaNum, 12, 0, 0, 0);
    }

    const d = dia?.toDate ? dia.toDate() : new Date(dia);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export async function obterConfigDia(dia) {
    const alvo = normalizarDia(dia);
    const docs = await buscarPorCampo(COLS.CONFIG_HORARIOS, "dia", alvo);
    return docs.length > 0 ? docs[0] : null;
}

export async function obterConfigMes(ano, mes) {
    const inicio = new Date(ano, mes, 1, 0, 0, 0, 0);
    const fim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
    const constraints = [where("dia", ">=", inicio), where("dia", "<=", fim)];
    return await listarColecao(COLS.CONFIG_HORARIOS, constraints);
}

export async function guardarConfigDia(dia, dados, operadorId) {
    const diaNormalizado = normalizarDia(dia);
    const existente = await obterConfigDia(diaNormalizado);

    if (existente) {
        await atualizarDocumento(COLS.CONFIG_HORARIOS, existente.id, {
            ...dados,
            dia: diaNormalizado
        });
        await registrarLog(operadorId, "atualizar_horario", COLS.CONFIG_HORARIOS, existente.id, { dia: diaNormalizado, dados });
    } else {
        const id = await criarDocumento(COLS.CONFIG_HORARIOS, {
            dia: diaNormalizado,
            ...dados
        });
        await registrarLog(operadorId, "criar_horario", COLS.CONFIG_HORARIOS, id, { dia: diaNormalizado, dados });
    }
}

export async function bloquearDia(dia, operadorId) {
    await guardarConfigDia(dia, {
        aberto: false,
        vagas: { gripe: 0, covid: 0, gripe_contingente: 0 },
        horarioInicio: null,
        horarioFim: null
    }, operadorId);
}

export async function obterVagasDisponiveis(dia, tipoVacina) {
    const config = await obterConfigDia(dia);
    if (!config) return null;
    if (config.aberto === false) return 0;

    const limite = config.vagas?.[tipoVacina] ?? 0;
    const ocupadas = config.vagasOcupadas?.[tipoVacina] ?? 0;
    return Math.max(0, limite - ocupadas);
}

export async function obterVagasDia(dia) {
    const config = await obterConfigDia(dia);

    if (!config) {
        return {
            gripe: null,
            covid: null,
            gripe_contingente: null,
            bloqueado: false,
            configurado: false
        };
    }

    if (config.aberto === false) {
        return {
            gripe: 0,
            covid: 0,
            gripe_contingente: 0,
            bloqueado: true,
            configurado: true
        };
    }

    const result = {};
    for (const tipo of ["gripe", "covid", "gripe_contingente"]) {
        const limite = config.vagas?.[tipo] ?? 0;
        const ocupadas = config.vagasOcupadas?.[tipo] ?? 0;
        result[tipo] = Math.max(0, limite - ocupadas);
    }

    result.bloqueado = false;
    result.configurado = true;
    return result;
}
