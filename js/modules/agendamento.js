/**
 * js/modules/agendamento.js
 * Núcleo de agendamento: validações de negócio, criação, consulta e gestão de estados.
 */
import { COLS, criarDocumento, atualizarDocumento, obterDocumento, buscarPorCampo, listarColecao, registrarLog, ts, where, limit } from "./db.js";
import { obterStockAgregado } from "./stock.js";
import { VACINAS } from "../../config/vacinas.js";
import { APP_CONFIG } from "../../config/app.js";

const ESTADOS = { AGENDADO: "Agendado", ADMINISTRADO: "Administrado", CANCELADO: "Cancelado", NAO_COMPARECEU: "Não Compareceu" };
const ESTADOS_DOSE = {
    AGENDADA: "agendada", ADMINISTRADA: "administrada", NAO_ADMINISTRADA: "nao_administrada",
    REDIRECIONADA: "redirecionada", QUEBRA: "quebra", REGRESSOU_STOCK: "regressou_stock",
};

export async function validarAgendamento(nif, vacinas, dataAgendamento) {
    const erros = [];
    const agendamentos = await buscarPorCampo(COLS.AGENDAMENTOS, "nif", nif);

    for (const vac of vacinas) {
        const config = VACINAS.find(v => v.id === vac.tipoVacina);
        if (!config || !config.ativo) { erros.push(`Vacina ${vac.tipoVacina} não está ativa.`); continue; }

        const mesmaVacinaAgendada = agendamentos.filter(a =>
            a.estado === ESTADOS.AGENDADO &&
            a.vacinasAgendadas?.some(v => v.tipoVacina === vac.tipoVacina && v.estadoDose === ESTADOS_DOSE.AGENDADA)
        );
        if (mesmaVacinaAgendada.length > 0) erros.push(`Já existe 1 vacina de ${config.nome} agendada para este NIF.`);

        if (config.bloquearSemStock) {
            const stock = await obterStockAgregado(vac.tipoVacina);
            if ((stock[vac.tipoVacina] || 0) <= 0) erros.push(`Sem stock disponível para ${config.nome}.`);
        }

        for (const a of agendamentos) {
            if (a.estado !== ESTADOS.AGENDADO) continue;
            const dataExistente = ts(a.dataAgendamento);
            const dataNova = new Date(dataAgendamento);
            if (dataExistente && dataNova.toDateString() !== dataExistente.toDateString()) {
                const diffDias = Math.abs((dataNova - dataExistente) / 86400000);
                if (diffDias < (config.intervaloDias || 14)) {
                    erros.push(`Intervalo mínimo de ${config.intervaloDias} dias entre vacinas para o mesmo NIF.`);
                    break;
                }
            }
        }
    }
    return erros;
}

export async function criarAgendamento(dados, operadorId) {
    const { nif, nome, telefone, vacinas, dataAgendamento } = dados;
    const erros = await validarAgendamento(nif, vacinas, dataAgendamento);
    if (erros.length > 0) throw new Error(erros.join("\n"));

    const utenteExistente = await buscarPorCampo(COLS.UTENTES, "nif", nif);
    let utenteId;
    if (utenteExistente.length === 0) {
        utenteId = await criarDocumento(COLS.UTENTES, { nif, nome, telefone, email: null, dataNascimento: null });
    } else {
        utenteId = utenteExistente[0].id;
        await atualizarDocumento(COLS.UTENTES, utenteId, { nome, telefone });
    }

    const vacinasAgendadas = vacinas.map(v => ({
        tipoVacina: v.tipoVacina, estadoDose: ESTADOS_DOSE.AGENDADA, observacoes: null,
        administradoEm: null, administradoPor: null, naoAdministradaEm: null, naoAdministradaPor: null,
        destinoDose: null, loteId: null, urgenciaAte: null, recuperadaDeDoseId: null,
    }));

    const agendamentoId = await criarDocumento(COLS.AGENDAMENTOS, {
        nif, utenteId, nome, telefone, vacinasAgendadas,
        dataAgendamento: new Date(dataAgendamento), estado: ESTADOS.AGENDADO, posicaoFila: null, operadorId,
    });

    await registrarLog(operadorId, "criar_agendamento", COLS.AGENDAMENTOS, agendamentoId, { nif, vacinas: vacinas.map(v => v.tipoVacina) });
    return agendamentoId;
}

export async function buscarAgendamentos(filtros = {}) {
    let constraints = [];
    if (filtros.nif) constraints.push(where("nif", "==", filtros.nif));
    if (filtros.estado) constraints.push(where("estado", "==", filtros.estado));
    if (filtros.dataInicio) constraints.push(where("dataAgendamento", ">=", new Date(filtros.dataInicio)));
    if (filtros.dataFim) constraints.push(where("dataAgendamento", "<=", new Date(filtros.dataFim)));
    if (filtros.limit) constraints.push(limit(filtros.limit));

    const resultados = await listarColecao(COLS.AGENDAMENTOS, constraints);
    if (filtros.nome) {
        const nomeLower = filtros.nome.toLowerCase();
        return resultados.filter(a => a.nome?.toLowerCase().includes(nomeLower));
    }
    return resultados;
}

export async function buscarHistoricoCompleto(filtros = {}) {
    const ativos = await buscarAgendamentos(filtros);
    let arquivados = [];
    if (filtros.incluirArquivo !== false) {
        let arqConstraints = [];
        if (filtros.nif) arqConstraints.push(where("nif", "==", filtros.nif));
        if (filtros.estado) arqConstraints.push(where("estado", "==", filtros.estado));
        arquivados = await listarColecao(COLS.AGENDAMENTOS_ARQUIVO, arqConstraints);
    }
    return [...ativos, ...arquivados];
}

export async function atribuirPosicaoFila(agendamentoId, posicao, operadorId) {
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { posicaoFila: posicao });
    await registrarLog(operadorId, "atribuir_fila", COLS.AGENDAMENTOS, agendamentoId, { posicao });
}

export async function marcarPresenca(agendamentoId, operadorId) {
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { presente: true });
    await registrarLog(operadorId, "marcar_presenca", COLS.AGENDAMENTOS, agendamentoId);
}

export async function administrarVacina(agendamentoId, indiceVacina, loteId, operadorId) {
    const ag = await obterDocumento(COLS.AGENDAMENTOS, agendamentoId);
    if (!ag) throw new Error("Agendamento não encontrado");

    const vacinas = [...ag.vacinasAgendadas];
    vacinas[indiceVacina] = { ...vacinas[indiceVacina], estadoDose: ESTADOS_DOSE.ADMINISTRADA, administradoEm: new Date(), administradoPor: operadorId, loteId };

    const todasAdm = vacinas.every(v => v.estadoDose === ESTADOS_DOSE.ADMINISTRADA);
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { vacinasAgendadas: vacinas, estado: todasAdm ? ESTADOS.ADMINISTRADO : ESTADOS.AGENDADO });

    const { administrarDose } = await import("./stock.js");
    await administrarDose(loteId, 1, operadorId);
    await registrarLog(operadorId, "administrar_vacina", COLS.AGENDAMENTOS, agendamentoId, { indiceVacina, loteId });
}

export async function naoAdministrarVacina(agendamentoId, indiceVacina, observacoes, operadorId) {
    const ag = await obterDocumento(COLS.AGENDAMENTOS, agendamentoId);
    if (!ag) throw new Error("Agendamento não encontrado");

    const vacinas = [...ag.vacinasAgendadas];
    const vac = vacinas[indiceVacina];
    const agora = new Date();

    if (vac.tipoVacina === "covid") {
        const urgenciaAte = new Date(agora.getTime() + APP_CONFIG.urgenciaCovidHoras * 3600000);
        vacinas[indiceVacina] = { ...vac, estadoDose: ESTADOS_DOSE.NAO_ADMINISTRADA, naoAdministradaEm: agora, naoAdministradaPor: operadorId, observacoes, urgenciaAte };
    } else {
        vacinas[indiceVacina] = { ...vac, estadoDose: ESTADOS_DOSE.REGRESSOU_STOCK, naoAdministradaEm: agora, naoAdministradaPor: operadorId, observacoes };
        const { regressoStockGripe } = await import("./stock.js");
        if (vac.loteId) await regressoStockGripe(vac.loteId, 1, operadorId);
    }

    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { vacinasAgendadas: vacinas });
    await registrarLog(operadorId, "nao_administrar", COLS.AGENDAMENTOS, agendamentoId, { indiceVacina, observacoes });
}

export async function recuperarDoseCovid(agendamentoOrigemId, indiceVacinaOrigem, novoUtenteNif, novoUtenteNome, operadorId) {
    const agOrigem = await obterDocumento(COLS.AGENDAMENTOS, agendamentoOrigemId);
    if (!agOrigem) throw new Error("Agendamento de origem não encontrado");

    const vacOrigem = agOrigem.vacinasAgendadas[indiceVacinaOrigem];
    if (!vacOrigem || vacOrigem.estadoDose !== ESTADOS_DOSE.NAO_ADMINISTRADA) throw new Error("A dose COVID não está em estado de não administrada.");

    const vacinasOrigem = [...agOrigem.vacinasAgendadas];
    vacinasOrigem[indiceVacinaOrigem] = { ...vacOrigem, estadoDose: ESTADOS_DOSE.REDIRECIONADA, destinoDose: novoUtenteNif };
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoOrigemId, { vacinasAgendadas: vacinasOrigem });

    const novoAgId = await criarAgendamento({ nif: novoUtenteNif, nome: novoUtenteNome, telefone: null, vacinas: [{ tipoVacina: "covid" }], dataAgendamento: new Date().toISOString() }, operadorId);

    const agNovo = await obterDocumento(COLS.AGENDAMENTOS, novoAgId);
    const vacinasNovo = [...agNovo.vacinasAgendadas];
    vacinasNovo[0] = { ...vacinasNovo[0], recuperadaDeDoseId: `${agendamentoOrigemId}_${indiceVacinaOrigem}` };
    await atualizarDocumento(COLS.AGENDAMENTOS, novoAgId, { vacinasAgendadas: vacinasNovo });

    await registrarLog(operadorId, "recuperar_dose_covid", COLS.AGENDAMENTOS, agendamentoOrigemId, { novoUtenteNif, novoAgId });
    return novoAgId;
}

export async function registarQuebra(agendamentoId, indiceVacina, motivo, operadorId) {
    const ag = await obterDocumento(COLS.AGENDAMENTOS, agendamentoId);
    if (!ag) throw new Error("Agendamento não encontrado");

    const vacinas = [...ag.vacinasAgendadas];
    vacinas[indiceVacina] = { ...vacinas[indiceVacina], estadoDose: ESTADOS_DOSE.QUEBRA, naoAdministradaPor: operadorId, naoAdministradaEm: new Date(), observacoes: motivo };
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { vacinasAgendadas: vacinas });

    const vac = vacinas[indiceVacina];
    if (vac.loteId) {
        const { retiradaStock } = await import("./stock.js");
        await retiradaStock(vac.loteId, "quebra", 1, motivo, operadorId);
    }
    await registrarLog(operadorId, "quebra_dose", COLS.AGENDAMENTOS, agendamentoId, { indiceVacina, motivo });
}

export async function cancelarAgendamento(agendamentoId, motivo, operadorId) {
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { estado: ESTADOS.CANCELADO, motivoCancelamento: motivo });
    await registrarLog(operadorId, "cancelar_agendamento", COLS.AGENDAMENTOS, agendamentoId, { motivo });
}

export async function marcarNaoCompareceu(agendamentoId, operadorId) {
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { estado: ESTADOS.NAO_COMPARECEU });
    await registrarLog(operadorId, "nao_compareceu", COLS.AGENDAMENTOS, agendamentoId);
}

export { ESTADOS, ESTADOS_DOSE };
