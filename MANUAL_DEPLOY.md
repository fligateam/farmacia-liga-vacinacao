# Manual de Deploy — Farmácia da Liga (Passo a Passo)

Este guia assume que não tens qualquer conhecimento técnico. Todos os passos são feitos através de sites e cliques — nunca precisas de usar o "terminal" ou "linha de comandos".

---

## 1. Criar conta e projeto no Firebase

1. Acede a **https://console.firebase.google.com** e inicia sessão com uma conta Google (cria uma se não tiveres).
2. Clica no botão **"Criar um projeto"** (ou "Add project").
3. Dá o nome **"farmacia-liga-vacinacao"** e clica em **"Continuar"**.
4. Desativa o Google Analytics (não é necessário) e clica em **"Criar projeto"**.
5. Aguarda a criação (1 minuto) e clica em **"Continuar"**.

---

## 2. Encontrar as chaves de configuração

1. Dentro do projeto, clica no ícone de **engrenagem** (⚙️) no canto superior esquerdo → **"Definições do projeto"**.
2. Desce até à secção **"As suas aplicações"** e clica no ícone **`</>`** (Web).
3. Dá o nome **"App Web Farmácia da Liga"** e clica em **"Registar app"**.
4. Vai aparecer um bloco de código com `apiKey`, `authDomain`, `projectId`, etc. **Copia esses valores.**
5. Abre o ficheiro `config/firebase.js` do projeto (recebeste este código) e substitui cada `"SUBSTITUIR_AQUI"` pelo valor correspondente que copiaste.

---

## 3. Ativar Firestore, Authentication e Hosting

**Firestore:**
1. No menu lateral esquerdo da consola Firebase, clica em **"Firestore Database"**.
2. Clica em **"Criar base de dados"**.
3. Escolhe **"Iniciar em modo de produção"** e clica **"Seguinte"**.
4. Escolhe a localização **"eur3 (europe-west)"** e clica **"Ativar"**.

**Authentication:**
1. No menu lateral, clica em **"Authentication"**.
2. Clica em **"Começar"** (Get started).
3. Na lista de fornecedores, clica em **"Email/Palavra-passe"**, ativa o interruptor **"Ativar"** e clica **"Guardar"**.

**Hosting (opcional, se não usares GitHub Pages):**
1. No menu lateral, clica em **"Hosting"**.
2. Clica em **"Começar"** e segue as instruções (podes ignorar esta secção se preferires usar apenas o GitHub Pages, explicado a seguir).

---

## 4. Criar conta e repositório no GitHub

1. Acede a **https://github.com** e clica em **"Sign up"** para criar conta (se não tiveres).
2. Após entrares, clica no botão **"+"** no canto superior direito → **"New repository"**.
3. Nome do repositório: **farmacia-liga-vacinacao**.
4. Marca como **"Public"**.
5. Clica em **"Create repository"**.
6. Na página do repositório, clica em **"uploading an existing file"** (ou "Add file" → "Upload files").
7. Arrasta **todos os ficheiros e pastas** do projeto (index.html, css, js, config, manifest.json, service-worker.js) para a área de upload.
8. Desce até ao fim da página e clica em **"Commit changes"**.

---

## 5. Ativar o GitHub Pages

1. No repositório, clica em **"Settings"** (menu superior do repositório).
2. No menu lateral esquerdo, clica em **"Pages"**.
3. Em **"Source"**, escolhe o branch **"main"** e a pasta **"/ (root)"**.
4. Clica em **"Save"**.
5. Aguarda 1-2 minutos e recarrega a página — vai aparecer um link do tipo:
   `https://o-teu-utilizador.github.io/farmacia-liga-vacinacao/`
   Esse é o link público da tua aplicação.

---

## 6. Ativar o plano Blaze (apenas para a Cloud Function de arquivo)

1. Na consola Firebase, clica em **"Upgrade"** (ou no ícone de faísca junto ao nome do projeto).
2. Escolhe o plano **"Blaze — Pagar conforme o uso"**.
3. Associa um cartão de crédito (é exigido pela Google, mas **não vais ter custos** enquanto ficares dentro dos limites gratuitos mensais, que são muito superiores ao uso desta app: 2 milhões de execuções de funções grátis por mês).
4. Confirma a atualização.

**Publicar as Cloud Functions** (arquivamento automático mensal):
1. Como não usamos linha de comandos, a forma mais simples é pedires a um técnico de confiança (ou usar o Firebase Console → "Functions" → seguir o assistente de importação de código) para publicar o ficheiro `functions/index.js`. Esta é a única etapa que idealmente beneficia de alguém com experiência técnica básica, porque a publicação de Cloud Functions exige a Firebase CLI. Nas versões seguintes deste guia podemos explorar alternativas 100% gráficas.

---

## 7. Criar o primeiro utilizador Administrador

1. Abre o link público da tua app (do passo 5).
2. Como ainda não existe nenhum administrador, vai aparecer automaticamente uma janela **"Configuração inicial"**.
3. Preenche o teu **Nome**, **Email** e uma **Palavra-passe** (mínimo 6 caracteres).
4. Clica em **"Criar administrador"**.
5. Volta ao ecrã de login e entra com esse email e palavra-passe.

---

## 8. Checklist final de verificação

- [ ] Consigo abrir o link público da app no telemóvel e no computador.
- [ ] Consigo fazer login com a conta de administrador criada.
- [ ] Consigo criar um novo agendamento de teste (NIF, nome, vacina, data).
- [ ] O agendamento aparece na tela de Validação.
- [ ] Consigo registar uma entrada de stock (lote, validade, quantidade).
- [ ] O stock disponível é atualizado corretamente na tela de Stock.
- [ ] Consigo configurar vagas para um dia na tela de Gestão de Horários.
- [ ] A tela de Dashboard mostra os números corretos da semana atual.
- [ ] Consigo exportar um ficheiro CSV a partir da tela de Validação.

Se todos os pontos estiverem confirmados, a aplicação está pronta a usar em produção.
