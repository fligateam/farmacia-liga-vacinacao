/**
 * functions/index.js
 * Cloud Functions — Farmácia da Liga
 * 1) Arquivamento mensal automático de agendamentos com mais de 12 meses.
 * 2) Backup semanal de contagens agregadas para auditoria.
 * 3) Criação segura de colaboradores via Admin SDK.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const COL_ATIVA = "agendamentos";
const COL_ARQUIVO = "agendamentos_arquivo";
const MESES_RETENCAO = 12;

exports.arquivarAgendamentosAntigos = functions.pubsub
    .schedule("0 3 1 * *")
    .timeZone("Europe/Lisbon")
    .onRun(async () => {
        const limiteData = new Date();
        limiteData.setMonth(limiteData.getMonth() - MESES_RETENCAO);

        const snapshot = await db.collection(COL_ATIVA)
            .where("dataAgendamento", "<", limiteData)
            .get();

        if (snapshot.empty) {
            console.log("Nenhum agendamento para arquivar este mês.");
            return null;
        }

        const batchSize = 400;
        let processados = 0;
        const docs = snapshot.docs;

        for (let i = 0; i < docs.length; i += batchSize) {
            const lote = docs.slice(i, i + batchSize);
            const batch = db.batch();

            lote.forEach((docSnap) => {
                const dados = docSnap.data();
                const refArquivo = db.collection(COL_ARQUIVO).doc(docSnap.id);
                batch.set(refArquivo, { ...dados, arquivadoEm: admin.firestore.FieldValue.serverTimestamp() });
                batch.delete(docSnap.ref);
            });

            await batch.commit();
            processados += lote.length;
        }

        console.log(`Arquivamento concluído: ${processados} agendamentos movidos para ${COL_ARQUIVO}.`);
        return null;
    });

exports.backupSemanalContagens = functions.pubsub
    .schedule("0 4 * * 1")
    .timeZone("Europe/Lisbon")
    .onRun(async () => {
        const ativos = await db.collection(COL_ATIVA).get();
        const arquivados = await db.collection(COL_ARQUIVO).get();

        await db.collection("backups_semanais").add({
            data: admin.firestore.FieldValue.serverTimestamp(),
            totalAgendamentosAtivos: ativos.size,
            totalAgendamentosArquivados: arquivados.size,
        });

        console.log(`Backup semanal registado: ${ativos.size} ativos, ${arquivados.size} arquivados.`);
        return null;
    });

exports.createCollaborator = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Utilizador não autenticado.");
    }

    const callerUid = context.auth.uid;
    const callerDoc = await db.collection("utilizadores").doc(callerUid).get();

    if (!callerDoc.exists || callerDoc.data().papel !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem criar colaboradores.");
    }

    const { nome, email, password, papel } = data || {};

    if (!nome || !email || !password || !papel) {
        throw new functions.https.HttpsError("invalid-argument", "Dados em falta.");
    }

    const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: nome,
        disabled: false
    });

    await db.collection("utilizadores").doc(userRecord.uid).set({
        uid: userRecord.uid,
        nome,
        email,
        papel,
        ativo: true,
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("logs_auditoria").add({
        utilizadorId: callerUid,
        acao: "criar_colaborador",
        colecaoAfetada: "utilizadores",
        docId: userRecord.uid,
        data: admin.firestore.FieldValue.serverTimestamp()
    });

    return { uid: userRecord.uid };
});
