/**
 * js/modules/agendamento.js
 * Núcleo de agendamento: validações de negócio, criação, consulta e gestão de estados.
 */
import { COLS, criarDocumento, atualizarDocumento, obterDocumento, buscarPorCampo, listarColecao, registrarLog, ts, where, limit } from "./db.js";
import { VACINAS } from "../../config/vacinas.js";
import { APP_CONFIG } from "../../config/app.js";

const ESTADOS = {
    AGENDADO: "Agendado",
    ADMINISTRADO: "Administrado",
    CANCELADO: "Cancelado",
    NAO_COMPARECEU: "Não Compareceu"
};

const ESTADOS_DOSE = {
    AGENDADA: "agendada",
    ADMINISTRADA: "administrada",
    NAO_ADMINISTRADA: "nao_administrada",
    REDIRECIONADA: "redirecionada",
    QUEBRA: "quebra",
    REGRESSOU_STOCK: "regressou_stock"
};

function normalizarDia(data) {
    const d = new Date(data);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export async function validarAgendamento(nif, vacinas, dataAgendamento) {
    const erros = [];
    const agendamentos = await buscarPorCampo(COLS.AGENDAMENTOS, "nif", nif);

    const tiposGripe = vacinas.filter(v => ["gripe", "gripe_contingente"].includes(v.tipoVacina));
    if (tiposGripe.length > 1) {
        erros.push("Só pode selecionar 1 tipo de vacina da gripe (normal ou contingente).");
    }

    for (const vac of vacinas) {
        const config = VACINAS.find(v => v.id === vac.tipoVacina);
        if (!config || !config.ativo) {
            erros.push(`Vacina ${vac.tipoVacina} não está ativa.`);
            continue;
        }

        const mesmaVacinaAgendada = agendamentos.filter(a =>
            a.estado === ESTADOS.AGENDADO &&
            a.vacinasAgendadas?.some(v => v.tipoVacina === vac.tipoVacina && v.estadoDose === ESTADOS_DOSE.AGENDADA)
        );

        if (mesmaVacinaAgendada.length > 0) {
            erros.push(`Já existe 1 vacina de ${config.nome} agendada para este NIF.`);
        }

        for (const a of agendamentos) {
            if (a.estado !== ESTADOS.AGENDADO) continue;

            const dataExistente = ts(a.dataAgendamento);
            const dataNova = normalizarDia(dataAgendamento);

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
    const { nif, nome, telefone, idade, observacoes, vacinas, dataAgendamento } = dados;

    const erros = await validarAgendamento(nif, vacinas, dataAgendamento);
    if (erros.length > 0) throw new Error(erros.join("\n"));

    const utenteExistente = await buscarPorCampo(COLS.UTENTES, "nif", nif);
    let utenteId;

    if (utenteExistente.length === 0) {
        utenteId = await criarDocumento(COLS.UTENTES, {
            nif,
            nome,
            telefone,
            idade: idade || null,
            email: null,
            dataNascimento: null,
            observacoes: observacoes || ""
        });
    } else {
        utenteId = utenteExistente[0].id;
        await atualizarDocumento(COLS.UTENTES, utenteId, {
            nome,
            telefone,
            idade: idade || null,
            observacoes: observacoes || ""
        });
    }

    const vacinasAgendadas = vacinas.map(v => ({
        tipoVacina: v.tipoVacina,
        estadoDose: ESTADOS_DOSE.AGENDADA,
        observacoes: observacoes || null,
        administradoEm: null,
        administradoPor: null,
        naoAdministradaEm: null,
        naoAdministradaPor: null,
        destinoDose: null,
        loteId: null,
        urgenciaAte: null,
        recuperadaDeDoseId: null
    }));

    const agendamentoId = await criarDocumento(COLS.AGENDAMENTOS, {
        nif,
        utenteId,
        nome,
        telefone,
        idade: idade || null,
        observacoes: observacoes || "",
        vacinasAgendadas,
        dataAgendamento: normalizarDia(dataAgendamento),
        estado: ESTADOS.AGENDADO,
        posicaoFila: null,
        operadorId
    });

    await registrarLog(operadorId, "criar_agendamento", COLS.AGENDAMENTOS, agendamentoId, {
        nif,
        idade,
        observacoes,
        vacinas: vacinas.map(v => v.tipoVacina)
    });

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
    vacinas[indiceVacina] = {
        ...vacinas[indiceVacina],
        estadoDose: ESTADOS_DOSE.ADMINISTRADA,
        administradoEm: new Date(),
        administradoPor: operadorId,
        loteId
    };

    const todasAdm = vacinas.every(v => v.estadoDose === ESTADOS_DOSE.ADMINISTRADA);

    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, {
        vacinasAgendadas: vacinas,
        estado: todasAdm ? ESTADOS.ADMINISTRADO : ESTADOS.AGENDADO
    });

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
        vacinas[indiceVacina] = {
            ...vac,
            estadoDose: ESTADOS_DOSE.NAO_ADMINISTRADA,
            naoAdministradaEm: agora,
            naoAdministradaPor: operadorId,
            observacoes,
            urgenciaAte
        };
    } else {
        vacinas[indiceVacina] = {
            ...vac,
            estadoDose: ESTADOS_DOSE.REGRESSOU_STOCK,
            naoAdministradaEm: agora,
            naoAdministradaPor: operadorId,
            observacoes
        };

        const { regressoStockGripe } = await import("./stock.js");
        if (vac.loteId) await regressoStockGripe(vac.loteId, 1, operadorId);
    }

    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { vacinasAgendadas: vacinas });
    await registrarLog(operadorId, "nao_administrar", COLS.AGENDAMENTOS, agendamentoId, { indiceVacina, observacoes });
}

export async function confirmarPresenca(agendamentoId, uid) {
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, {
        presente: true,
        confirmadoPor: uid,
        confirmadoEm: new Date()
    });
    await registrarLog(uid, "confirmar_presenca", COLS.AGENDAMENTOS, agendamentoId, {});
}

export async function anularAgendamento(agendamentoId, uid) {
    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, {
        estado: ESTADOS.CANCELADO,
        anuladoPor: uid,
        anuladoEm: new Date()
    });
    await registrarLog(uid, "anular_agendamento", COLS.AGENDAMENTOS, agendamentoId, {});
}

export async function recuperarDoseCovid(agendamentoId, indiceVacina, nifDestino, nomeDestino, operadorId) {
    const ag = await obterDocumento(COLS.AGENDAMENTOS, agendamentoId);
    if (!ag) throw new Error("Agendamento não encontrado");

    const vacinas = [...ag.vacinasAgendadas];
    vacinas[indiceVacina] = {
        ...vacinas[indiceVacina],
        estadoDose: ESTADOS_DOSE.REDIRECIONADA,
        destinoDose: { nif: nifDestino, nome: nomeDestino }
    };

    await atualizarDocumento(COLS.AGENDAMENTOS, agendamentoId, { vacinasAgendadas: vacinas });
    await registrarLog(operadorId, "recuperar_dose", COLS.AGENDAMENTOS, agendamentoId, { nifDestino, nomeDestino });
}
