app_js = r'''/**
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
let mesHorarios = new Date();
let diaHorariosSelecionado = null;
let diasHorariosSelecionados = [];
let filtroVacinaStock = "todos";
let chartTipoVacina = null, chartComparencia = null, chartTendencia = null;

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
        try { await login(email, password); }
        catch (err) { erroEl.textContent = "Credenciais inválidas ou utilizador sem perfil atribuído."; erroEl.classList.remove("hidden"); }
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
        } catch (err) { mostrarToast("Erro ao criar administrador: " + err.message, "error"); }
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

    document.getElementById("mes-anterior").addEventListener("click", () => { mesAtual.setMonth(mesAtual.getMonth() - 1); renderizarCalendarioAgendamento(); });
    document.getElementById("mes-seguinte").addEventListener("click", () => { mesAtual.setMonth(mesAtual.getMonth() + 1); renderizarCalendarioAgendamento(); });
    document.getElementById("btn-novo-agendamento").addEventListener("click", () => abrirModal("modal-agendamento"));

    document.getElementById("btn-agendar-dia").addEventListener("click", () => {
        if (diaSelecionado) {
            const y = diaSelecionado.getFullYear();
            const m = String(diaSelecionado.getMonth() + 1).padStart(2, "0");
            const d = String(diaSelecionado.getDate()).padStart(2, "0");
            document.getElementById("ag-data").value = `${y}-${m}-${d}`;
        }
        abrirModal("modal-agendamento");
    });

    document.getElementById("form-agendamento").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nif = document.getElementById("ag-nif").value;
        const nome = document.getElementById("ag-nome").value;
        const telefone = document.getElementById("ag-telefone").value;
        const idade = Number(document.getElementById("ag-idade")?.value || 0);
        const observacoes = document.getElementById("ag-obs")?.value?.trim() || "";
        const data = document.getElementById("ag-data").value;
        const vacinasSelecionadas = Array.from(document.querySelectorAll('input[name="ag-vacina"]:checked')).map(cb => ({ tipoVacina: cb.value }));
        const erroEl = document.getElementById("ag-erro");
        erroEl.classList.add("hidden");

        if (vacinasSelecionadas.length === 0) { erroEl.textContent = "Seleciona pelo menos uma vacina."; erroEl.classList.remove("hidden"); return; }

        const gripeTipos = vacinasSelecionadas.filter(v => ["gripe", "gripe_contingente"].includes(v.tipoVacina));
        if (gripeTipos.length > 1) {
            erroEl.textContent = "Só pode selecionar 1 tipo de vacina da gripe (normal ou contingente).";
            erroEl.classList.remove("hidden");
            return;
        }

        try {
            const user = getUtilizadorAtual();
            await Agendamento.criarAgendamento({ nif, nome, telefone, idade, observacoes, vacinas: vacinasSelecionadas, dataAgendamento: data }, user.uid);
            mostrarToast("Agendamento criado com sucesso.", "success");
            fecharModal("modal-agendamento");
            document.getElementById("form-agendamento").reset();
            renderizarCalendarioAgendamento();
        } catch (err) { erroEl.textContent = err.message; erroEl.classList.remove("hidden"); }
    });
}

async function renderizarCalendarioAgendamento() {
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

    const configMes = await Horarios.obterConfigMes(ano, mes);
    const configPorDia = {};
    configMes.forEach(c => { const d = c.dia?.toDate ? c.dia.toDate() : new Date(c.dia); configPorDia[d.toDateString()] = c; });

    for (let i = 0; i < diaSemanaInicio; i++) html += `<div class="calendar-day empty"></div>`;

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const dataAtual = new Date(ano, mes, dia);
        const config = configPorDia[dataAtual.toDateString()];
        const bloqueado = config && config.aberto === false;

        let badgesHtml = "";
        if (bloqueado) {
            badgesHtml = `<span class="vac-badge vac-badge-zero">Fechado</span>`;
        } else if (config) {
            const tipos = [
                { id: "gripe", label: "G", classe: "vac-badge-gripe" },
                { id: "covid", label: "C", classe: "vac-badge-covid" },
                { id: "gripe_contingente", label: "GC", classe: "vac-badge-gripec" },
            ];
            tipos.forEach(t => {
                if (filtroVacinaAtiva !== "todos" && filtroVacinaAtiva !== t.id) return;
                const limite = config.vagas?.[t.id] || 0;
                const ocupadas = config.vagasOcupadas?.[t.id] || 0;
                const disp = Math.max(0, limite - ocupadas);
                const classe = disp === 0 ? "vac-badge-zero" : t.classe;
                badgesHtml += `<span class="vac-badge ${classe}">${t.label}: ${disp}</span>`;
            });
        }

        html += `<div class="calendar-day ${bloqueado ? "blocked" : ""}" data-dia="${dataAtual.toISOString()}">
            <span class="calendar-day-num">${dia}</span>
            ${badgesHtml}
        </div>`;
    }

    container.innerHTML = html;
    container.querySelectorAll(".calendar-day[data-dia]").forEach(el => {
        el.addEventListener("click", () => {
            container.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("selected"));
            el.classList.add("selected");
            diaSelecionado = new Date(el.dataset.dia);
            mostrarResumoDia(diaSelecionado);
        });
    });
}

async function mostrarResumoDia(dia) {
    const resumoCard = document.getElementById("dia-selecionado-resumo");
    const titulo = document.getElementById("dia-resumo-titulo");
    const vagasEl = document.getElementById("dia-resumo-vagas");
    resumoCard.style.display = "block";
    titulo.textContent = `Dia ${formatarData(dia)}`;

    const vagas = await Horarios.obterVagasDia(dia.toISOString());
    if (vagas.bloqueado) { vagasEl.innerHTML = `<div class="alert alert-danger">Este dia está fechado para agendamentos.</div>`; return; }

    vagasEl.innerHTML = VACINAS.filter(v => v.ativo).map(v => `
        <span class="vac-badge" style="background:${v.cor}22; color:${v.cor}; margin-right:0.5rem; padding:0.3rem 0.75rem; font-size:0.85rem;">
            ${v.nome}: ${vagas[v.id] ?? 0} vagas
        </span>
    `).join("");
}

/* ===================== VALIDAÇÃO / ATENDIMENTO ===================== */

function configurarEventosValidacao() {
    document.getElementById("busca-validacao").addEventListener("input", debounce(renderizarValidacao, 400));
    document.getElementById("filtro-estado-validacao").addEventListener("change", renderizarValidacao);
    document.getElementById("toggle-historico").addEventListener("change", renderizarValidacao);
    document.getElementById("btn-exportar-validacao").addEventListener("click", async () => {
        const dados = await obterAgendamentosFiltrados();
        Exportacao.exportarAgendamentosCSV(dados);
    });
}

async function obterAgendamentosFiltrados() {
    const termo = document.getElementById("busca-validacao").value.trim();
    const estado = document.getElementById("filtro-estado-validacao").value;
    const incluirHistorico = document.getElementById("toggle-historico").checked;

    const filtros = {};
    if (estado) filtros.estado = estado;
    if (termo) {
        if (/^\d{9}$/.test(termo)) filtros.nif = termo;
        else if (/^\d{4}-\d{2}-\d{2}/.test(termo)) { filtros.dataInicio = termo; filtros.dataFim = termo; }
        else filtros.nome = termo;
    }

    return incluirHistorico ? await Agendamento.buscarHistoricoCompleto({ ...filtros, incluirArquivo: true }) : await Agendamento.buscarAgendamentos(filtros);
}

async function renderizarValidacao() {
    agendamentosDia = await obterAgendamentosFiltrados();
    const tbody = document.getElementById("tabela-agendamentos-dia");

    if (agendamentosDia.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Nenhum agendamento encontrado.</p></div></td></tr>`;
    } else {
        tbody.innerHTML = agendamentosDia.map((a, idx) => `
            <tr data-idx="${idx}" style="cursor:pointer;">
                <td>${formatarDataHora(a.dataAgendamento?.toDate ? a.dataAgendamento.toDate() : a.dataAgendamento)}</td>
                <td>${a.nome}</td>
                <td>${a.nif}</td>
                <td>${(a.vacinasAgendadas || []).map(v => v.tipoVacina).join(", ")}</td>
                <td>${badgeEstado(a.estado)}</td>
            </tr>
        `).join("");
        tbody.querySelectorAll("tr[data-idx]").forEach(tr => tr.addEventListener("click", () => mostrarDetalheUtente(agendamentosDia[parseInt(tr.dataset.idx)])));
    }

    renderizarFilaChegada();
}

function renderizarFilaChegada() {
    const fila = agendamentosDia.filter(a => a.estado === "Agendado").sort((a, b) => (a.posicaoFila || 999) - (b.posicaoFila || 999));
    const container = document.getElementById("fila-chegada");
    if (fila.length === 0) { container.innerHTML = `<div class="empty-state"><p>Sem utentes na fila.</p></div>`; return; }

    container.innerHTML = fila.map((a, idx) => `
        <div class="queue-item">
            <span class="queue-position">${a.posicaoFila || "-"}</span>
            <div style="flex:1;"><strong>${a.nome}</strong><br><span style="font-size:0.75rem; color:var(--cor-texto-muted);">${a.nif}</span></div>
            <button class="btn btn-ghost" data-nif="${a.nif}" data-set-posicao="${idx}">Definir posição</button>
        </div>
    `).join("");

    container.querySelectorAll("[data-set-posicao]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const posicao = prompt("Posição na fila:");
            if (!posicao) return;
            const ag = fila[parseInt(btn.dataset.setPosicao)];
            const user = getUtilizadorAtual();
            await Agendamento.atribuirPosicaoFila(ag.id, parseInt(posicao), user.uid);
            mostrarToast("Posição atribuída.", "success");
            renderizarValidacao();
        });
    });
}

function mostrarDetalheUtente(agendamento) {
    const container = document.getElementById("modal-detalhe-conteudo");
    const vacinasHtml = (agendamento.vacinasAgendadas || []).map((v, idx) => {
        const config = VACINAS.find(vc => vc.id === v.tipoVacina);
        let acoes = "";
        if (v.estadoDose === "agendada") {
            acoes = `
                <button class="btn btn-primary" data-adm="${idx}">Administrar</button>
                <button class="btn btn-secondary" data-nao-adm="${idx}">Não administrada</button>
            `;
        } else if (v.estadoDose === "nao_administrada" && v.tipoVacina === "covid") {
            const tempo = calcularTempoRestante(v.urgenciaAte);
            acoes = `<span class="badge badge-cancelado">Urgência: ${tempo ? tempo.texto : "—"}</span>
                <button class="btn btn-secondary" data-recuperar="${idx}">Redirecionar dose</button>`;
        } else {
            acoes = `<span class="badge badge-administrado">${v.estadoDose}</span>`;
        }
        return `<div style="padding:0.75rem; border-bottom:1px solid var(--cor-borda);">
            <strong>${config ? config.nome : v.tipoVacina}</strong><br>
            <div style="margin-top:0.5rem; display:flex; gap:0.5rem; flex-wrap:wrap;">${acoes}</div>
        </div>`;
    }).join("");

    container.innerHTML = `
        <p><strong>${agendamento.nome}</strong> — NIF: ${agendamento.nif}</p>
        <p style="color:var(--cor-texto-muted); font-size:0.85rem; margin-bottom:1rem;">Estado geral: ${badgeEstado(agendamento.estado)}</p>
        ${vacinasHtml}
    `;

    container.querySelectorAll("[data-adm]").forEach(btn => btn.addEventListener("click", async () => {
        const loteId = prompt("ID do lote utilizado:");
        if (!loteId) return;
        const user = getUtilizadorAtual();
        try {
            await Agendamento.administrarVacina(agendamento.id, parseInt(btn.dataset.adm), loteId, user.uid);
            mostrarToast("Vacina administrada.", "success");
            fecharModal("modal-detalhe");
            renderizarValidacao();
        } catch (err) { mostrarToast(err.message, "error"); }
    }));

    container.querySelectorAll("[data-nao-adm]").forEach(btn => btn.addEventListener("click", async () => {
        const obs = prompt("Observações (opcional):") || "";
        const user = getUtilizadorAtual();
        await Agendamento.naoAdministrarVacina(agendamento.id, parseInt(btn.dataset.naoAdm), obs, user.uid);
        mostrarToast("Registado como não administrada.", "info");
        fecharModal("modal-detalhe");
        renderizarValidacao();
    }));

    container.querySelectorAll("[data-recuperar]").forEach(btn => btn.addEventListener("click", async () => {
        const nifDestino = prompt("NIF do novo utente:");
        const nomeDestino = prompt("Nome do novo utente:");
        if (!nifDestino || !nomeDestino) return;
        const user = getUtilizadorAtual();
        try {
            await Agendamento.recuperarDoseCovid(agendamento.id, parseInt(btn.dataset.recuperar), nifDestino, nomeDestino, user.uid);
            mostrarToast("Dose redirecionada com sucesso.", "success");
            fecharModal("modal-detalhe");
            renderizarValidacao();
        } catch (err) { mostrarToast(err.message, "error"); }
    }));

    abrirModal("modal-detalhe");
}

/* ===================== STOCK ===================== */

function configurarEventosStock() {
    document.querySelectorAll("#page-stock .chip[data-vac-stock]").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll("#page-stock .chip[data-vac-stock]").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            filtroVacinaStock = chip.dataset.vacStock;
            renderizarStock();
        });
    });

    document.getElementById("mov-tipo").addEventListener("change", (e) => {
        const isEntrada = e.target.value === "entrada";
        document.getElementById("mov-validade-group").classList.toggle("hidden", !isEntrada);
        document.getElementById("mov-motivo-group").classList.toggle("hidden", isEntrada);
        document.getElementById("mov-validade").required = isEntrada;
        document.getElementById("mov-motivo").required = !isEntrada;
    });

    document.getElementById("form-movimento-stock").addEventListener("submit", async (e) => {
        e.preventDefault();
        const tipo = document.getElementById("mov-tipo").value;
        const vacina = document.getElementById("mov-vacina").value;
        const lote = document.getElementById("mov-lote").value;
        const quantidade = parseInt(document.getElementById("mov-quantidade").value);
        const notas = document.getElementById("mov-notas").value;
        const user = getUtilizadorAtual();

        try {
            if (tipo === "entrada") {
                const validade = document.getElementById("mov-validade").value;
                await Stock.entradaStock(vacina, lote, validade, quantidade, notas, user.uid);
            } else {
                const motivo = document.getElementById("mov-motivo").value;
                const lotes = await Stock.obterStockDisponivel(vacina);
                const loteObj = lotes.find(l => l.numeroLote === lote);
                if (!loteObj) throw new Error("Lote não encontrado.");
                await Stock.retiradaStock(loteObj.id, motivo, quantidade, notas, user.uid);
            }
            mostrarToast("Movimento registado com sucesso.", "success");
            document.getElementById("form-movimento-stock").reset();
            renderizarStock();
        } catch (err) { mostrarToast(err.message, "error"); }
    });

    document.getElementById("btn-exportar-stock").addEventListener("click", async () => {
        const lotes = await Stock.obterStockDisponivel();
        Exportacao.exportarStockCSV(lotes);
    });
}

async function renderizarStock() {
    const filtro = filtroVacinaStock === "todos" ? null : filtroVacinaStock;
    const lotes = await Stock.obterStockDisponivel(filtro);
    const agregado = await Stock.obterStockAgregado();

    const kpiContainer = document.getElementById("stock-kpis");
    kpiContainer.innerHTML = VACINAS.filter(v => v.ativo).map(v => `
        <div class="kpi-card">
            <span class="kpi-label">${v.nome}</span>
            <span class="kpi-value">${agregado[v.id] || 0}</span>
            <span class="kpi-trend neutral">doses disponíveis</span>
        </div>
    `).join("");

    const tbody = document.getElementById("tabela-lotes");
    if (lotes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>Nenhum lote registado.</p></div></td></tr>`;
    } else {
        tbody.innerHTML = lotes.map(l => {
            const config = VACINAS.find(v => v.id === l.tipoVacina);
            return `<tr>
                <td>${config ? config.nome : l.tipoVacina}</td>
                <td>${l.numeroLote}</td>
                <td>${formatarData(l.validade)}</td>
                <td>${l.entradas}</td>
                <td>${l.retiradas}</td>
                <td>${l.administradas}</td>
                <td><strong>${l.disponivel}</strong></td>
            </tr>`;
        }).join("");
    }

    const alertas = await Stock.obterAlertas(APP_CONFIG.diasAlertaValidade, APP_CONFIG.stockMinimoAlerta);
    const alertasContainer = document.getElementById("alertas-stock");
    if (alertas.length === 0) {
        alertasContainer.innerHTML = `<div class="alert alert-info">Sem alertas ativos de momento.</div>`;
    } else {
        alertasContainer.innerHTML = alertas.map(a => {
            if (a.tipo === "stock_baixo") return `<div class="alert alert-warning">Stock baixo: lote ${a.lote} (${a.tipoVacina}) — ${a.disponivel} unidades.</div>`;
            return `<div class="alert alert-warning">Validade próxima: lote ${a.lote} (${a.tipoVacina}) — ${formatarData(a.validade)}.</div>`;
        }).join("");
    }
}

/* ===================== HORÁRIOS ===================== */

function configurarEventosHorarios() {
    document.getElementById("horarios-mes-anterior").addEventListener("click", () => { mesHorarios.setMonth(mesHorarios.getMonth() - 1); renderizarCalendarioHorarios(); });
    document.getElementById("horarios-mes-seguinte").addEventListener("click", () => { mesHorarios.setMonth(mesHorarios.getMonth() + 1); renderizarCalendarioHorarios(); });

    document.getElementById("btn-guardar-horario").addEventListener("click", async () => {
        if (!diaHorariosSelecionado) return;
        const user = getUtilizadorAtual();
        const dados = {
            aberto: document.getElementById("dia-aberto").checked,
            horarioInicio: document.getElementById("dia-hora-inicio").value,
            horarioFim: document.getElementById("dia-hora-fim").value,
            vagas: {
                gripe: parseInt(document.getElementById("limite-gripe").value) || 0,
                covid: parseInt(document.getElementById("limite-covid").value) || 0,
                gripe_contingente: parseInt(document.getElementById("limite-gripec").value) || 0,
            },
        };
        await Horarios.guardarConfigDia(diaHorariosSelecionado, dados, user.uid);
        mostrarToast("Configuração guardada.", "success");
        renderizarCalendarioHorarios();
    });

    document.getElementById("btn-export-marcacoes").addEventListener("click", async () => {
        const dados = await Agendamento.buscarAgendamentos({});
        Exportacao.exportarAgendamentosCSV(dados);
    });
    document.getElementById("btn-export-presencas").addEventListener("click", async () => {
        const dados = await Agendamento.buscarAgendamentos({});
        Exportacao.exportarPresencasCSV(dados);
    });
}

async function renderizarCalendarioHorarios() {
    const container = document.getElementById("calendario-horarios");
    const titulo = document.getElementById("horarios-mes-titulo");
    const ano = mesHorarios.getFullYear();
    const mes = mesHorarios.getMonth();
    titulo.textContent = mesHorarios.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

    const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    let html = weekdays.map(d => `<div class="calendar-header">${d}</div>`).join("");

    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diaSemanaInicio = (primeiroDia.getDay() + 6) % 7;
    const configMes = await Horarios.obterConfigMes(ano, mes);
    const configPorDia = {};
    configMes.forEach(c => {
        const d = c.dia?.toDate ? c.dia.toDate() : new Date(c.dia);
        configPorDia[new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString()] = c;
    });

    for (let i = 0; i < diaSemanaInicio; i++) html += `<div class="calendar-day empty"></div>`;

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const dataAtual = new Date(ano, mes, dia, 12, 0, 0, 0);
        const key = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), dataAtual.getDate()).toDateString();
        const config = configPorDia[key];
        const bloqueado = config && config.aberto === false;
        const limiteGripe = config?.vagas?.gripe ?? 0;
        const limiteCovid = config?.vagas?.covid ?? 0;
        const limiteGripeC = config?.vagas?.gripe_contingente ?? 0;
        const ocupGripe = config?.vagasOcupadas?.gripe ?? 0;
        const ocupCovid = config?.vagasOcupadas?.covid ?? 0;
        const ocupGripeC = config?.vagasOcupadas?.gripe_contingente ?? 0;
        const semVagas = config && !bloqueado && (Math.max(0, limiteGripe - ocupGripe) + Math.max(0, limiteCovid - ocupCovid) + Math.max(0, limiteGripeC - ocupGripeC) <= 0);
        const iso = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, "0")}-${String(dataAtual.getDate()).padStart(2, "0")}`;
        const selected = diasHorariosSelecionados.includes(iso);
        html += `<div class="calendar-day ${bloqueado ? "blocked blocked-red" : ""} ${semVagas ? "no-slots-light-red" : ""} ${selected ? "selected" : ""}" data-dia="${iso}">
            <span class="calendar-day-num">${dia}</span>
            ${config ? `<span class="vac-badge ${bloqueado ? "vac-badge-zero" : semVagas ? "vac-badge-zero" : "vac-badge-gripe"}">${bloqueado ? "Fechado" : semVagas ? "Sem vagas" : "Configurado"}</span>` : ""}
        </div>`;
    }
    container.innerHTML = html;

    container.querySelectorAll(".calendar-day[data-dia]").forEach(el => {
        el.addEventListener("click", async (e) => {
            const iso = el.dataset.dia;
            if (e.shiftKey && diaHorariosSelecionado) {
                const start = new Date(`${diaHorariosSelecionado}T12:00:00`);
                const end = new Date(`${iso}T12:00:00`);
                const inicio = start <= end ? start : end;
                const fim = start <= end ? end : start;
                const datas = [];
                const cur = new Date(inicio);
                while (cur <= fim) {
                    datas.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
                    cur.setDate(cur.getDate() + 1);
                }
                diasHorariosSelecionados = datas;
            } else {
                diaHorariosSelecionado = iso;
                if (diasHorariosSelecionados.includes(iso)) {
                    diasHorariosSelecionados = diasHorariosSelecionados.filter(d => d !== iso);
                } else {
                    diasHorariosSelecionados.push(iso);
                }
            }

            await renderizarCalendarioHorarios();
            await renderizarFormHorariosSelecionados();
        });
    });
}

async function renderizarFormHorariosSelecionados() {
    const card = document.getElementById("config-dia-card");
    const titulo = document.getElementById("config-dia-titulo");
    if (!card || !titulo) return;

    if (diasHorariosSelecionados.length === 0) {
        card.style.display = "none";
        return;
    }

    card.style.display = "block";
    titulo.textContent = diasHorariosSelecionados.length === 1
        ? `Configurar ${formatarData(new Date(`${diasHorariosSelecionados[0]}T12:00:00`))}`
        : `Aplicar a ${diasHorariosSelecionados.length} dias selecionados`;

    const config = await Horarios.obterConfigDia(diasHorariosSelecionados[0]);
    document.getElementById("dia-aberto").checked = config ? config.aberto !== false : true;
    document.getElementById("dia-hora-inicio").value = config?.horarioInicio || "09:00";
    document.getElementById("dia-hora-fim").value = config?.horarioFim || "18:00";
    document.getElementById("limite-gripe").value = config?.vagas?.gripe ?? 14;
    document.getElementById("limite-covid").value = config?.vagas?.covid ?? 12;
    const g = document.getElementById("limite-gripec");
    if (g) g.value = config?.vagas?.gripe_contingente ?? 8;
}

/* ===================== DASHBOARD ===================== */

function configurarEventosDashboard() {
    const btnAplicar = document.getElementById("btn-aplicar-horarios-selecionados");
    if (btnAplicar) {
        btnAplicar.addEventListener("click", async () => {
            if (diasHorariosSelecionados.length === 0) {
                mostrarToast("Seleciona dias no calendário primeiro.", "error");
                return;
            }

            const aberto = document.getElementById("dia-aberto").checked;
            const horarioInicio = document.getElementById("dia-hora-inicio").value;
            const horarioFim = document.getElementById("dia-hora-fim").value;
            const vagas = {
                gripe: Number(document.getElementById("limite-gripe").value || 0),
                covid: Number(document.getElementById("limite-covid").value || 0),
                gripe_contingente: Number(document.getElementById("limite-gripec")?.value || 0)
            };

            try {
                for (const dia of diasHorariosSelecionados) {
                    await Horarios.guardarConfigDia(dia, { aberto, horarioInicio, horarioFim, vagas }, getUtilizadorAtual()?.uid);
                }
                mostrarToast(`Horários aplicados a ${diasHorariosSelecionados.length} dias.`, "success");
                await renderizarCalendarioHorarios();
            } catch (err) {
                mostrarToast(err.message || "Erro ao aplicar horários.", "error");
            }
        });
    }

    document.getElementById("dashboard-toggle-arquivo").addEventListener("change", renderizarDashboard);
    document.getElementById("btn-export-dashboard").addEventListener("click", async () => {
        const { inicio, fim } = obterSemanaAtual();
        const dados = await Agendamento.buscarAgendamentos({ dataInicio: inicio.toISOString(), dataFim: fim.toISOString() });
        Exportacao.exportarAgendamentosCSV(dados);
    });
}

function obterSemanaAtual() {
    const hoje = new Date();
    const diaSemana = (hoje.getDay() + 6) % 7;
    const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - diaSemana); inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio); fim.setDate(inicio.getDate() + 6); fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
}

async function renderizarDashboard() {
    const { inicio, fim } = obterSemanaAtual();
    document.getElementById("dashboard-periodo").textContent = `${inicio.toLocaleDateString("pt-PT", { day: "2-digit", month: "long" })} a ${fim.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}`;

    const incluirArquivo = document.getElementById("dashboard-toggle-arquivo").checked;
    const metricas = await DashboardMod.obterMetricas(inicio.toISOString(), fim.toISOString(), incluirArquivo);

    document.getElementById("dashboard-kpis").innerHTML = `
        <div class="kpi-card"><span class="kpi-label">Total agendamentos</span><span class="kpi-value">${metricas.total}</span></div>
        <div class="kpi-card"><span class="kpi-label">Taxa de comparência</span><span class="kpi-value">${metricas.taxaComp}%</span></div>
        <div class="kpi-card"><span class="kpi-label">Administradas</span><span class="kpi-value">${metricas.compareceu}</span></div>
        <div class="kpi-card"><span class="kpi-label">Não compareceu</span><span class="kpi-value">${metricas.naoCompareceu}</span></div>
    `;

    document.getElementById("metricas-operacionais").innerHTML = `
        <p style="padding:0.5rem 0; border-bottom:1px solid var(--cor-borda);">Doses COVID recuperadas: <strong>${metricas.recuperadas}</strong></p>
        <p style="padding:0.5rem 0; border-bottom:1px solid var(--cor-borda);">Quebras registadas: <strong>${metricas.quebras}</strong></p>
        <p style="padding:0.5rem 0; border-bottom:1px solid var(--cor-borda);">Em janela de urgência (COVID): <strong>${metricas.emUrgencia}</strong></p>
        <p style="padding:0.5rem 0;">Devoluções de stock (Gripe): <strong>${metricas.retornosStock}</strong></p>
    `;

    const ctxTipo = document.getElementById("grafico-tipo-vacina").getContext("2d");
    const labelsTipo = VACINAS.filter(v => v.ativo).map(v => v.nome);
    const dadosAgendadas = VACINAS.filter(v => v.ativo).map(v => metricas.porTipo[v.id]?.agendadas || 0);
    const dadosAdministradas = VACINAS.filter(v => v.ativo).map(v => metricas.porTipo[v.id]?.administradas || 0);

    if (chartTipoVacina) chartTipoVacina.destroy();
    chartTipoVacina = new Chart(ctxTipo, {
        type: "bar",
        data: { labels: labelsTipo, datasets: [
            { label: "Agendadas", data: dadosAgendadas, backgroundColor: "#7a9b7e" },
            { label: "Administradas", data: dadosAdministradas, backgroundColor: "#2f6b4f" },
        ]},
        options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });

    const ctxComp = document.getElementById("grafico-comparencia").getContext("2d");
    if (chartComparencia) chartComparencia.destroy();
    chartComparencia = new Chart(ctxComp, {
        type: "doughnut",
        data: { labels: ["Administrado", "Não Compareceu", "Cancelado"], datasets: [{ data: [metricas.compareceu, metricas.naoCompareceu, metricas.cancelado], backgroundColor: ["#2f6b4f", "#c9a15a", "#b5563f"] }] },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });

    const tendencia = await DashboardMod.obterTendenciaSemanal(inicio.toISOString(), fim.toISOString());
    const ctxTend = document.getElementById("grafico-tendencia").getContext("2d");
    if (chartTendencia) chartTendencia.destroy();
    chartTendencia = new Chart(ctxTend, {
        type: "line",
        data: {
            labels: tendencia.map(d => d.dia.toLocaleDateString("pt-PT", { weekday: "short" })),
            datasets: [
                { label: "Agendadas", data: tendencia.map(d => d.agendadas), borderColor: "#7a9b7e", tension: 0.3 },
                { label: "Administradas", data: tendencia.map(d => d.administradas), borderColor: "#2f6b4f", tension: 0.3 },
            ],
        },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });
}
'''
