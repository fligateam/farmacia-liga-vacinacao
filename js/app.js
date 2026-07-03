/**
 * js/app.js
 * Orquestrador principal — liga a interface (index.html) aos módulos.
 */
import { COLS, listarColecao } from "./modules/db.js";
import { initAuth, login, logout, getUtilizadorAtual, criarUtilizadorAdmin, criarPerfilColaborador, PAPEIS } from "./modules/auth.js";
import * as Agendamento from "./modules/agendamento.js";
import * as Stock from "./modules/stock.js";
import * as Horarios from "./modules/horarios.js";
import * as Exportacao from "./modules/export.js";
import * as DashboardMod from "./modules/dashboard.js";
import { mostrarToast, abrirModal, fecharModal, formatarData, formatarDataHora, calcularTempoRestante, badgeEstado, debounce } from "./modules/ui.js";
import { VACINAS } from "../config/vacinas.js";
import { APP_CONFIG } from "../config/app.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./modules/db.js";

let mesAtual = new Date();
let filtroVacinaAtiva = "todos";
let diaSelecionado = null;
let agendamentosDia = [];

document.addEventListener("DOMContentLoaded", async () => {
    await verificarPrimeiroAcesso();

    initAuth(
        (user) => {
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("app-shell").classList.remove("hidden");
            document.getElementById("user-info").textContent = `${user.nome} (${user.papel === PAPEIS.ADMIN ? "Administrador" : "Operador"})`;
            aplicarPermissoes(user);
            navegarPara("agendamento");
        },
        () => {
            document.getElementById("login-screen").classList.remove("hidden");
            document.getElementById("app-shell").classList.add("hidden");
        }
    );

    configurarEventos();
});

async function verificarPrimeiroAcesso() {
    try {
        const admins = await listarColecao(COLS.UTILIZADORES);
        if (admins.length === 0) abrirModal("modal-setup-admin");
    } catch (e) {
        console.warn("Não foi possível verificar utilizadores existentes:", e);
    }
}

function aplicarPermissoes(user) {
    const isAdminUser = user.papel === PAPEIS.ADMIN;
    document.querySelectorAll("[data-admin-only]").forEach(el => { el.style.display = isAdminUser ? "" : "none"; });
}

function navegarPara(pagina) {
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    document.getElementById(`page-${pagina}`).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.querySelector(`.nav-item[data-page="${pagina}"]`).classList.add("active");
    document.getElementById("sidebar").classList.remove("open");

    if (pagina === "agendamento") renderizarCalendarioAgendamento();
    if (pagina === "validacao") renderizarValidacao();
    if (pagina === "stock") renderizarStock();
    if (pagina === "horarios") renderizarCalendarioHorarios();
    if (pagina === "dashboard") renderizarDashboard();
}

function configurarEventos() {
    document.querySelectorAll(".nav-item[data-page]").forEach(item => item.addEventListener("click", () => navegarPara(item.dataset.page)));
    document.getElementById("mobile-toggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
    document.getElementById("btn-logout").addEventListener("click", async () => await logout());
    document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", () => fecharModal(el.dataset.closeModal)));

    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        const erroEl = document.getElementById("login-error");
        erroEl.classList.add("hidden");
        try {
            await login(email, password);
        } catch (err) {
            erroEl.textContent = "Credenciais inválidas ou utilizador sem perfil atribuído.";
            erroEl.classList.remove("hidden");
        }
    });

    document.getElementById("form-setup-admin").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nome = document.getElementById("setup-nome").value;
        const email = document.getElementById("setup-email").value;
        const password = document.getElementById("setup-password").value;
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await criarUtilizadorAdmin(cred.user.uid, nome, email);
            fecharModal("modal-setup-admin");
            mostrarToast("Administrador criado com sucesso. Faz login para continuar.", "success");
        } catch (err) {
            mostrarToast("Erro ao criar administrador: " + err.message, "error");
        }
    });

    const formCriarColaborador = document.getElementById("form-criar-colaborador");
    const ccFeedback = document.getElementById("cc-feedback");

    if (formCriarColaborador) {
        formCriarColaborador.addEventListener("submit", async (e) => {
            e.preventDefault();
            ccFeedback.textContent = "A guardar perfil...";
            try {
                const uid = document.getElementById("cc-uid").value.trim();
                const nome = document.getElementById("cc-nome").value.trim();
                const email = document.getElementById("cc-email").value.trim();
                const papel = document.getElementById("cc-papel").value;

                await criarPerfilColaborador({ uid, nome, email, papel });

                formCriarColaborador.reset();
                ccFeedback.textContent = "Perfil de colaborador guardado com sucesso.";
            } catch (err) {
                ccFeedback.textContent = err.message || "Erro ao guardar colaborador.";
            }
        });
    }

    configurarEventosAgendamento();
    configurarEventosValidacao();
    configurarEventosStock();
    configurarEventosHorarios();
    configurarEventosDashboard();
}

/* ===================== AGENDAMENTO ===================== */

function configurarEventosAgendamento() {
    document.querySelectorAll("#filtro-vacinas .chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll("#filtro-vacinas .chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            filtroVacinaAtiva = chip.dataset.vac;
            renderizarCalendarioAgendamento();
        });
    });

    document.getElementById("mes-anterior").addEventListener("click", () => {
        mesAtual.setMonth(mesAtual.getMonth() - 1);
        renderizarCalendarioAgendamento();
    });

    document.getElementById("mes-seguinte").addEventListener("click", () => {
        mesAtual.setMonth(mesAtual.getMonth() + 1);
        renderizarCalendarioAgendamento();
    });

    document.getElementById("btn-novo-agendamento").addEventListener("click", () => abrirModal("modal-agendamento"));

    document.getElementById("btn-agendar-dia").addEventListener("click", () => {
        if (diaSelecionado) document.getElementById("ag-data").value = diaSelecionado.toISOString().slice(0, 10);
        abrirModal("modal-agendamento");
    });

    document.getElementById("form-agendamento").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nif = document.getElementById("ag-nif").value;
        const nome = document.getElementById("ag-nome").value;
        const telefone = document.getElementById("ag-telefone").value;
        const data = document.getElementById("ag-data").value;
        const vacinasSelecionadas = Array.from(document.querySelectorAll('input[name="ag-vacina"]:checked')).map(cb => ({ tipoVacina: cb.value }));
        const erroEl = document.getElementById("ag-erro");
        erroEl.classList.add("hidden");

        if (vacinasSelecionadas.length === 0) {
            erroEl.textContent = "Seleciona pelo menos uma vacina.";
            erroEl.classList.remove("hidden");
            return;
        }

        try {
            const user = getUtilizadorAtual();
            await Agendamento.criarAgendamento({ nif, nome, telefone, vacinas: vacinasSelecionadas, dataAgendamento: data }, user.uid);
            mostrarToast("Agendamento criado com sucesso.", "success");
            fecharModal("modal-agendamento");
            document.getElementById("form-agendamento").reset();
            renderizarCalendarioAgendamento();
        } catch (err) {
            erroEl.textContent = err.message;
            erroEl.classList.remove("hidden");
        }
    });
}

async function renderizarCalendarioAgendamento() {
    if (typeof Horarios.obterConfigMes !== "function") return;

    const container = document.getElementById("calendario-agendamento");
    const titulo = document.getElementById("calendario-titulo");
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    titulo.textContent = mesAtual.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

    const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    let html = weekdays.map(d => `<div class="calendar-header">${d}</div>`).join("");

    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diaSemanaInicio = (primeiroDia.getDay() + 6) % 7;

    let configMes = [];
    try {
        configMes = await Horarios.obterConfigMes(ano, mes);
    } catch (e) {
        console.warn("Erro ao obter configuração do mês:", e);
    }

    const configPorDia = {};
    configMes.forEach(c => {
        const d = c.dia?.toDate ? c.dia.toDate() : new Date(c.dia);
        configPorDia[d.toDateString()] = c;
    });

    for (let i = 0; i < diaSemanaInicio; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const dataAtual = new Date(ano, mes, dia);
        const config = configPorDia[dataAtual.toDateString()];
        const bloqueado = config && config.aberto === false;

        let badgesHtml = "";
        if (bloqueado) {
            badgesHtml = `<span class="vac-badge vac-badge-zero">Fechado</span>`;
        } else if (config) {
            const tipos = [
                { id: "gripe", label: "Gripe" },
                { id: "covid", label: "Covid" },
                { id: "pneumonia", label: "Pneum." },
                { id: "shingrix", label: "Shingrix" }
            ];

            badgesHtml = tipos.map(tipo => {
                const vagas = config.vagas?.[tipo.id] ?? 0;
                const classe = vagas > 0 ? "vac-badge" : "vac-badge vac-badge-zero";
                return `<span class="${classe}">${tipo.label}: ${vagas}</span>`;
            }).join("");
        }

        html += `
            <div class="calendar-day" data-dia="${dataAtual.toISOString()}">
                <div class="day-number">${dia}</div>
                <div class="day-badges">${badgesHtml}</div>
            </div>
        `;
    }

    container.innerHTML = html;

    container.querySelectorAll(".calendar-day[data-dia]").forEach(el => {
        el.addEventListener("click", async () => {
            diaSelecionado = new Date(el.dataset.dia);
            await renderizarAgendaDia();
        });
    });
}

async function renderizarAgendaDia() {
    if (!diaSelecionado) return;

    const titulo = document.getElementById("agenda-dia-titulo");
    const lista = document.getElementById("agenda-dia-lista");

    if (titulo) {
        titulo.textContent = `Agenda de ${formatarData(diaSelecionado)}`;
    }

    try {
        agendamentosDia = await Agendamento.listarAgendamentosPorDia(diaSelecionado, filtroVacinaAtiva);
    } catch (e) {
        console.warn("Erro ao listar agendamentos do dia:", e);
        agendamentosDia = [];
    }

    if (!lista) return;

    if (agendamentosDia.length === 0) {
        lista.innerHTML = `<div class="empty-state">Sem agendamentos para este dia.</div>`;
        return;
    }

    lista.innerHTML = agendamentosDia.map(ag => `
        <div class="card item-agendamento">
            <div class="item-topo">
                <strong>${ag.nome}</strong>
                <span>${ag.telefone || ""}</span>
            </div>
            <div class="item-meta">
                <span>NIF: ${ag.nif || "-"}</span>
                <span>${(ag.vacinas || []).map(v => v.tipoVacina).join(", ")}</span>
            </div>
        </div>
    `).join("");
}

/* ===================== VALIDAÇÃO ===================== */

function configurarEventosValidacao() {
    const pesquisa = document.getElementById("validacao-pesquisa");
    if (!pesquisa) return;

    pesquisa.addEventListener("input", debounce(() => renderizarValidacao(), 250));
}

async function renderizarValidacao() {
    const lista = document.getElementById("validacao-lista");
    if (!lista || typeof Agendamento.listarPendentes !== "function") return;

    let items = [];
    try {
        items = await Agendamento.listarPendentes();
    } catch (e) {
        console.warn("Erro ao listar validações:", e);
    }

    const termo = (document.getElementById("validacao-pesquisa")?.value || "").toLowerCase().trim();
    if (termo) {
        items = items.filter(i =>
            (i.nome || "").toLowerCase().includes(termo) ||
            (i.nif || "").toLowerCase().includes(termo)
        );
    }

    if (items.length === 0) {
        lista.innerHTML = `<div class="empty-state">Sem registos por validar.</div>`;
        return;
    }

    lista.innerHTML = items.map(item => `
        <div class="card validacao-item">
            <div>
                <strong>${item.nome}</strong>
                <p>${item.nif || "-"} · ${formatarData(item.dataAgendamento)}</p>
            </div>
            <div class="actions-row">
                <button class="btn btn-primary" data-validar="${item.id}">Validar</button>
                <button class="btn btn-secondary" data-falta="${item.id}">Falta</button>
            </div>
        </div>
    `).join("");

    lista.querySelectorAll("[data-validar]").forEach(btn => {
        btn.addEventListener("click", async () => {
            try {
                await Agendamento.marcarComoValidado(btn.dataset.validar, getUtilizadorAtual()?.uid);
                mostrarToast("Utente validado com sucesso.", "success");
                renderizarValidacao();
            } catch (e) {
                mostrarToast(e.message || "Erro ao validar.", "error");
            }
        });
    });

    lista.querySelectorAll("[data-falta]").forEach(btn => {
        btn.addEventListener("click", async () => {
            try {
                await Agendamento.marcarComoFalta(btn.dataset.falta, getUtilizadorAtual()?.uid);
                mostrarToast("Falta registada com sucesso.", "success");
                renderizarValidacao();
            } catch (e) {
                mostrarToast(e.message || "Erro ao registar falta.", "error");
            }
        });
    });
}

/* ===================== STOCK ===================== */

function configurarEventosStock() {
    const form = document.getElementById("form-stock");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const vacina = document.getElementById("stock-vacina").value;
        const quantidade = Number(document.getElementById("stock-quantidade").value || 0);
        const tipo = document.getElementById("stock-tipo").value;
        const notas = document.getElementById("stock-notas").value;

        try {
            if (typeof Stock.registarMovimento === "function") {
                await Stock.registarMovimento({
                    vacina,
                    quantidade,
                    tipo,
                    notas
                }, getUtilizadorAtual()?.uid);
            }

            form.reset();
            mostrarToast("Movimento de stock registado.", "success");
            renderizarStock();
        } catch (e) {
            mostrarToast(e.message || "Erro ao registar stock.", "error");
        }
    });
}

async function renderizarStock() {
    const resumo = document.getElementById("stock-resumo");
    const historico = document.getElementById("stock-historico");

    let stockAtual = [];
    let movimentos = [];

    try {
        if (typeof Stock.obterStockAtual === "function") stockAtual = await Stock.obterStockAtual();
        if (typeof Stock.listarMovimentos === "function") movimentos = await Stock.listarMovimentos();
    } catch (e) {
        console.warn("Erro ao renderizar stock:", e);
    }

    if (resumo) {
        resumo.innerHTML = stockAtual.length
            ? stockAtual.map(item => `
                <div class="card stock-card">
                    <strong>${item.vacina}</strong>
                    <p>${item.quantidade ?? 0} doses</p>
                </div>
            `).join("")
            : `<div class="empty-state">Sem dados de stock.</div>`;
    }

    if (historico) {
        historico.innerHTML = movimentos.length
            ? movimentos.map(m => `
                <div class="card movimento-item">
                    <strong>${m.vacina}</strong>
                    <p>${m.tipo} · ${m.quantidade}</p>
                    <span>${formatarDataHora(m.criadoEm)}</span>
                </div>
            `).join("")
            : `<div class="empty-state">Sem movimentos registados.</div>`;
    }
}

/* ===================== HORÁRIOS ===================== */

function configurarEventosHorarios() {
    const prev = document.getElementById("horarios-mes-anterior");
    const next = document.getElementById("horarios-mes-seguinte");

    if (prev) {
        prev.addEventListener("click", () => {
            mesAtual.setMonth(mesAtual.getMonth() - 1);
            renderizarCalendarioHorarios();
        });
    }

    if (next) {
        next.addEventListener("click", () => {
            mesAtual.setMonth(mesAtual.getMonth() + 1);
            renderizarCalendarioHorarios();
        });
    }

    const form = document.getElementById("form-horarios");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const data = document.getElementById("hor-data").value;
            const aberto = document.getElementById("hor-aberto").checked;
            const gripe = Number(document.getElementById("hor-gripe").value || 0);
            const covid = Number(document.getElementById("hor-covid").value || 0);
            const pneumonia = Number(document.getElementById("hor-pneumonia").value || 0);
            const shingrix = Number(document.getElementById("hor-shingrix").value || 0);

            try {
                if (typeof Horarios.guardarConfigDia === "function") {
                    await Horarios.guardarConfigDia({
                        data,
                        aberto,
                        vagas: { gripe, covid, pneumonia, shingrix }
                    }, getUtilizadorAtual()?.uid);
                }

                mostrarToast("Horário guardado com sucesso.", "success");
                renderizarCalendarioHorarios();
            } catch (e) {
                mostrarToast(e.message || "Erro ao guardar horários.", "error");
            }
        });
    }
}

async function renderizarCalendarioHorarios() {
    const titulo = document.getElementById("horarios-titulo");
    const calendario = document.getElementById("calendario-horarios");
    if (!titulo || !calendario) return;

    titulo.textContent = mesAtual.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diaSemanaInicio = (primeiroDia.getDay() + 6) % 7;

    let configMes = [];
    try {
        if (typeof Horarios.obterConfigMes === "function") configMes = await Horarios.obterConfigMes(ano, mes);
    } catch (e) {
        console.warn("Erro ao obter horários do mês:", e);
    }

    const mapa = {};
    configMes.forEach(c => {
        const d = c.dia?.toDate ? c.dia.toDate() : new Date(c.dia);
        mapa[d.toDateString()] = c;
    });

    const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    let html = weekdays.map(d => `<div class="calendar-header">${d}</div>`).join("");

    for (let i = 0; i < diaSemanaInicio; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const dataAtual = new Date(ano, mes, dia);
        const config = mapa[dataAtual.toDateString()];
        const fechado = config && config.aberto === false;

        html += `
            <div class="calendar-day ${fechado ? "blocked" : ""}" data-horario-dia="${dataAtual.toISOString()}">
                <div class="day-number">${dia}</div>
                <div class="day-badges">
                    ${config ? `
                        <span class="vac-badge ${fechado ? "vac-badge-zero" : ""}">
                            ${fechado ? "Fechado" : "Configurado"}
                        </span>
                    ` : ""}
                </div>
            </div>
        `;
    }

    calendario.innerHTML = html;

    calendario.querySelectorAll("[data-horario-dia]").forEach(el => {
        el.addEventListener("click", () => {
            const data = new Date(el.dataset.horarioDia);
            document.getElementById("hor-data").value = data.toISOString().slice(0, 10);

            const cfg = mapa[data.toDateString()];
            if (cfg) {
                document.getElementById("hor-aberto").checked = cfg.aberto !== false;
                document.getElementById("hor-gripe").value = cfg.vagas?.gripe ?? 0;
                document.getElementById("hor-covid").value = cfg.vagas?.covid ?? 0;
                document.getElementById("hor-pneumonia").value = cfg.vagas?.pneumonia ?? 0;
                document.getElementById("hor-shingrix").value = cfg.vagas?.shingrix ?? 0;
            }
        });
    });
}

/* ===================== DASHBOARD ===================== */

function configurarEventosDashboard() {
    const btn = document.getElementById("btn-exportar-dashboard");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        try {
            if (typeof Exportacao.exportarDashboard === "function") {
                await Exportacao.exportarDashboard();
                mostrarToast("Dashboard exportado com sucesso.", "success");
            }
        } catch (e) {
            mostrarToast(e.message || "Erro ao exportar dashboard.", "error");
        }
    });
}

async function renderizarDashboard() {
    if (typeof DashboardMod.renderizarDashboard !== "function") return;

    try {
        await DashboardMod.renderizarDashboard({
            VACINAS,
            APP_CONFIG,
            formatarData,
            formatarDataHora,
            calcularTempoRestante,
            badgeEstado
        });
    } catch (e) {
        console.warn("Erro ao renderizar dashboard:", e);
    }
}
