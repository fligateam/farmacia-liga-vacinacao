/**
 * js/modules/db.js
 * Camada de acesso a dados Firestore.
 */
import { firebaseConfig } from "../../config/firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc,
    deleteDoc, query, where, limit, onSnapshot, writeBatch, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, app };

export const COLS = {
    UTENTES: "utentes",
    AGENDAMENTOS: "agendamentos",
    AGENDAMENTOS_ARQUIVO: "agendamentos_arquivo",
    LOTES: "lotes",
    MOVIMENTOS_STOCK: "movimentos_stock",
    CONFIG_HORARIOS: "config_horarios",
    CONFIG_VACINAS: "config_vacinas",
    UTILIZADORES: "utilizadores",
    LOGS_AUDITORIA: "logs_auditoria",
};

export async function criarDocumento(colecao, dados) {
    const ref = await addDoc(collection(db, colecao), { ...dados, criadoEm: serverTimestamp() });
    return ref.id;
}

export async function obterDocumento(colecao, id) {
    const snap = await getDoc(doc(db, colecao, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function atualizarDocumento(colecao, id, dados) {
    await updateDoc(doc(db, colecao, id), { ...dados, atualizadoEm: serverTimestamp() });
}

export async function eliminarDocumento(colecao, id) {
    await deleteDoc(doc(db, colecao, id));
}

export async function listarColecao(colecao, constraints = []) {
    const q = query(collection(db, colecao), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function buscarPorCampo(colecao, campo, valor, constraints = []) {
    const q = query(collection(db, colecao), where(campo, "==", valor), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscrever(colecao, constraints, callback) {
    const q = query(collection(db, colecao), ...constraints);
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function batchWrite(operacoes) {
    const batch = writeBatch(db);
    operacoes.forEach(op => {
        if (op.tipo === "set") batch.set(doc(db, op.colecao, op.id), op.dados);
        else if (op.tipo === "update") batch.update(doc(db, op.colecao, op.id), op.dados);
        else if (op.tipo === "delete") batch.delete(doc(db, op.colecao, op.id));
    });
    await batch.commit();
}

export function ts(data) {
    if (!data) return null;
    if (data instanceof Timestamp) return data.toDate();
    if (data instanceof Date) return data;
    if (typeof data === "string") return new Date(data);
    return null;
}

export async function registrarLog(utilizadorId, acao, colecaoAfetada, docId, detalhes = {}) {
    await addDoc(collection(db, COLS.LOGS_AUDITORIA), {
        utilizadorId, acao, colecaoAfetada, docId, detalhes, data: serverTimestamp(),
    });
}

export { limit, where };
