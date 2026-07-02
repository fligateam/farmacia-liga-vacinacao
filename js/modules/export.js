/**
 * js/modules/export.js
 * Exportações CSV, Excel e Google Sheets.
 */
export function exportarCSV(dados, nomeFicheiro, colunas = null) {
    if (!dados || dados.length === 0) { alert("Não há dados para exportar."); return; }
    const keys = colunas || Object.keys(dados[0]);
    const escape = (val) => {
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toLocaleString("pt-PT");
        if (typeof val === "object") return JSON.stringify(val);
        const s = String(val).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    };
    const header = keys.join(",");
    const rows = dados.map(r => keys.map(k => escape(r[k])).join(","));
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeFicheiro}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportarAgendamentosCSV(agendamentos, operador = null) {
    const colunas = ["nome", "nif", "dataAgendamento", "estado", "telefone", "posicaoFila", "operadorId"];
    let dados = agendamentos;
    if (operador) dados = dados.filter(a => a.operadorId === operador);
    exportarCSV(dados, "agendamentos", colunas);
}

export function exportarPresencasCSV(agendamentos) {
    const colunas = ["nome", "nif", "dataAgendamento", "estado", "presente"];
    const dados = agendamentos.map(a => ({ ...a, presente: a.presente ? "Sim" : "Não", dataAgendamento: a.dataAgendamento instanceof Date ? a.dataAgendamento : new Date(a.dataAgendamento) }));
    exportarCSV(dados, "presencas", colunas);
}

export function exportarStockCSV(lotes) {
    const colunas = ["tipoVacina", "numeroLote", "validade", "entradas", "retiradas", "administradas"];
    const dados = lotes.map(l => ({ ...l, disponivel: (l.entradas || 0) - (l.retiradas || 0) - (l.administradas || 0), validade: l.validade instanceof Date ? l.validade : new Date(l.validade) }));
    exportarCSV(dados, "stock", colunas);
}
