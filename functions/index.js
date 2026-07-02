/**
 * functions/index.js
 * Cloud Functions — Farmácia da Liga
 * 1) Arquivamento mensal automático de agendamentos com mais de 12 meses.
 * 2) Backup semanal de contagens agregadas para auditoria.
 *
 * IMPORTANTE: Requer plano Blaze (pay-as-you-go), mas fica dentro dos limites
 * gratuitos mensais do Firebase (2M invocações grátis/mês) para o volume desta farmácia.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const COL_ATIVA = "agendamentos";
const COL_ARQUIVO = "agendamentos_arquivo";
const MESES_RETENCAO = 12;

exports.arquivarAgendamentosAntigos = functions.pubsub
    .schedule("0 3 1 * *") // dia 1 de cada mês, às 03:00
    .timeZone("Europe/Lisbon")
    .onRun(async (context) => {
        const limiteData = new Date();
        limiteData.setMonth(limiteData.getMonth() - MESES_RETENCAO);

        const snapshot = await db.collection(COL_ATIVA)
            .where("dataAgendamento", "<", limiteData)
            .get();

        if (snapshot.empty) {
            console.log("Nenhum agendamento para arquivar este mês.");
            return null;
        }

        const batchSize = 400; // limite seguro do Firestore por batch (500)
        let processados = 0;
        const docs = snapshot.docs;

        for (let i = 0; i < docs.length; i += batchSize) {
            const lote = docs.slice(i, i + batchSize);
            const batch = db.batch();

            lote.forEach((doc) => {
                const dados = doc.data();
                const refArquivo = db.collection(COL_ARQUIVO).doc(doc.id);
                batch.set(refArquivo, { ...dados, arquivadoEm: admin.firestore.FieldValue.serverTimestamp() });
                batch.delete(doc.ref);
            });

            await batch.commit();
            processados += lote.length;
        }

        console.log(`Arquivamento concluído: ${processados} agendamentos movidos para ${COL_ARQUIVO}.`);
        return null;
    });

exports.backupSemanalContagens = functions.pubsub
    .schedule("0 4 * * 1") // toda segunda-feira às 04:00
    .timeZone("Europe/Lisbon")
    .onRun(async (context) => {
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
