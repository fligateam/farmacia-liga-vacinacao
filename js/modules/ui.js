/**
 * js/modules/ui.js
 * Utilitários de UI: toasts, modais, loading, formatação.
 */
export function mostrarToast(mensagem, tipo = "info") {
    let container = document.querySelector(".toast-container");
    if (!container) { container = document.createElement("div"); container.className = "toast-container"; document.body.appendChild(container); }
    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = "slideIn 0.3s ease reverse"; setTimeout(() => toast.remove(), 300); }, 3500);
}

export function abrirModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.classList.add("active"); }
export function fecharModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.classList.remove("active"); }

export function mostrarLoading(elemento, mostrar = true) {
    if (mostrar) {
        if (!elemento.querySelector(".loading-spinner")) { const spinner = document.createElement("span"); spinner.className = "loading-spinner"; elemento.appendChild(spinner); }
    } else {
        const spinner = elemento.querySelector(".loading-spinner");
        if (spinner) spinner.remove();
    }
}

export function formatarData(data) {
    if (!data) return "—";
    const d = data instanceof Date ? data : new Date(data);
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatarDataHora(data) {
    if (!data) return "—";
    const d = data instanceof Date ? data : new Date(data);
    return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatarHora(data) {
    if (!data) return "—";
    const d = data instanceof Date ? data : new Date(data);
    return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export function calcularTempoRestante(urgenciaAte) {
    if (!urgenciaAte) return null;
    const agora = new Date();
    const limiteData = urgenciaAte instanceof Date ? urgenciaAte : new Date(urgenciaAte);
    const diff = limiteData - agora;
    if (diff <= 0) return { expirado: true, texto: "Expirado" };
    const horas = Math.floor(diff / 3600000);
    const minutos = Math.floor((diff % 3600000) / 60000);
    return { expirado: false, texto: `${horas}h ${minutos}m` };
}

export function badgeEstado(estado) {
    const classes = { "Agendado": "badge-agendado", "Administrado": "badge-administrado", "Cancelado": "badge-cancelado", "Não Compareceu": "badge-nao-compareceu" };
    const cls = classes[estado] || "badge-agendado";
    return `<span class="badge ${cls}">${estado}</span>`;
}

export function gerarSkeleton(linhas = 5, colunas = 4) {
    let html = "";
    for (let i = 0; i < linhas; i++) {
        html += "<tr>";
        for (let j = 0; j < colunas; j++) html += `<td><div class="skeleton" style="height: 14px; width: 80%;"></div></td>`;
        html += "</tr>";
    }
    return html;
}

export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
