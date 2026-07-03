/**
 * js/modules/auth.js
 * Gestão de autenticação e permissões.
 */
import { auth, db, COLS, registrarLog } from "./db.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PAPEIS = { ADMIN: "admin", OPERADOR: "operador" };
let utilizadorAtual = null;

export function initAuth(onLogin, onLogout) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const perfilDoc = await getDoc(doc(db, COLS.UTILIZADORES, user.uid));
            if (perfilDoc.exists()) {
                utilizadorAtual = { uid: user.uid, email: user.email, ...perfilDoc.data() };
                if (onLogin) onLogin(utilizadorAtual);
            } else {
                await signOut(auth);
                if (onLogout) onLogout();
            }
        } else {
            utilizadorAtual = null;
            if (onLogout) onLogout();
        }
    });
}

export async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const perfilDoc = await getDoc(doc(db, COLS.UTILIZADORES, cred.user.uid));
    if (!perfilDoc.exists()) {
        await signOut(auth);
        throw new Error("Utilizador sem perfil atribuído. Contacta o administrador.");
    }
    utilizadorAtual = { uid: cred.user.uid, email: cred.user.email, ...perfilDoc.data() };
    await registrarLog(cred.user.uid, "login", COLS.UTILIZADORES, cred.user.uid);
    return utilizadorAtual;
}

export async function logout() {
    if (utilizadorAtual) {
        await registrarLog(utilizadorAtual.uid, "logout", COLS.UTILIZADORES, utilizadorAtual.uid);
    }
    await signOut(auth);
    utilizadorAtual = null;
}

export function getUtilizadorAtual() {
    return utilizadorAtual;
}

export function isAdmin() {
    return !!utilizadorAtual && utilizadorAtual.papel === PAPEIS.ADMIN;
}

export function isOperador() {
    return !!utilizadorAtual && (
        utilizadorAtual.papel === PAPEIS.OPERADOR ||
        utilizadorAtual.papel === PAPEIS.ADMIN
    );
}

export async function criarUtilizadorAdmin(uid, nome, email) {
    await setDoc(doc(db, COLS.UTILIZADORES, uid), {
        uid,
        nome,
        email,
        papel: PAPEIS.ADMIN,
        ativo: true,
        criadoEm: serverTimestamp()
    });
}

export async function criarPerfilColaborador({ uid, nome, email, papel }) {
    if (!isAdmin()) {
        throw new Error("Apenas administradores podem criar colaboradores.");
    }

    await setDoc(doc(db, COLS.UTILIZADORES, uid), {
        uid,
        nome,
        email,
        papel,
        ativo: true,
        criadoEm: serverTimestamp()
    });

    await registrarLog(utilizadorAtual.uid, "criar_perfil_colaborador", COLS.UTILIZADORES, uid);
}

export { PAPEIS };
