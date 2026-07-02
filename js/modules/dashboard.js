/**
 * js/modules/dashboard.js
 * Dashboard: métricas semanais, taxa de comparência, ocupação.
 */
import { COLS, listarColecao, ts, where } from "./db.js";
import { VACINAS } from "../../config/vacinas.js";

export async function obterMetricas(dataInicio, dataFim, incluirArquivo = false) {
    const constraints = [where("dataAgendamento", ">=", new Date(dataInicio)), where("dataAgendamento", "<=", new Date(dataFim))];
    const agendamentos = await listarColecao(COLS.AGENDAMENTOS, constraints);
    let arquivados = [];
    if (incluirArquivo) arquivados = await listarColecao(COLS.AGENDAMENTOS_ARQUIVO, constraints);

    const todos = [...agendamentos, ...arquivados];
    const total = todos.length;
    const compareceu = todos.filter(a => a.estado === "Administrado").length;
    const naoCompareceu = todos.filter(a => a.estado === "Não Compareceu").length;
    const cancelado = todos.filter(a => a.estado === "Cancelado").length;
    const taxaComp = total > 0 ? Math.round((compareceu / total) * 100) : 0;

    const porTipo = {};
    VACINAS.forEach(v => { porTipo[v.id] = { agendadas: 0, administradas: 0 }; });
    todos.forEach(a => {
        (a.vacinasAgendadas || []).forEach(vac => {
            if (porTipo[vac.tipoVacina]) {
                porTipo[vac.tipoVacina].agendadas++;
                if (vac.estadoDose === "administrada") porTipo[vac.tipoVacina].administradas++;
            }
        });
    });

    const recuperadas = todos.reduce((acc, a) => acc + (a.vacinasAgendadas || []).filter(v => v.estadoDose === "redirecionada").length, 0);
    const quebras = todos.reduce((acc, a) => acc + (a.vacinasAgendadas || []).filter(v => v.estadoDose === "quebra").length, 0);
    const emUrgencia = todos.reduce((acc, a) => acc + (a.vacinasAgendadas || []).filter(v => v.estadoDose === "nao_administrada" && v.tipoVacina === "covid" && v.urgenciaAte).length, 0);
    const retornosStock = todos.reduce((acc, a) => acc + (a.vacinasAgendadas || []).filter(v => v.estadoDose === "regressou_stock").length, 0);

    return { total, compareceu, naoCompareceu, cancelado, taxaComp, porTipo, recuperadas, quebras, emUrgencia, retornosStock };
}

export async function obterTendenciaSemanal(dataInicio, dataFim) {
    const constraints = [where("dataAgendamento", ">=", new Date(dataInicio)), where("dataAgendamento", "<=", new Date(dataFim))];
    const agendamentos = await listarColecao(COLS.AGENDAMENTOS, constraints);

    const dias = [];
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
        const dia = new Date(d);
        const agendadas = agendamentos.filter(a => { const da = ts(a.dataAgendamento); return da && da.toDateString() === dia.toDateString(); }).length;
        const administradas = agendamentos.filter(a => { const da = ts(a.dataAgendamento); return da && da.toDateString() === dia.toDateString() && a.estado === "Administrado"; }).length;
        dias.push({ dia: new Date(dia), agendadas, administradas });
    }
    return dias;
}
