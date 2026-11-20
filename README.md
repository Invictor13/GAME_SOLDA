# Welding Master 3D

Abra `index.html` com um duplo clique. Mantenha a pasta `assets` ao lado do arquivo. O jogo usa WebGL e os recursos da bancada são locais.

## Modos

- **Carreira** — dez ordens desbloqueadas em sequência. Cada missão apresenta nota mínima, meta de execução e recompensa. A última ordem tem duas peças. O primeiro sucesso em cada missão concede XP e créditos.
- **Arcade** — três desafios cronometrados. O relógio começa no primeiro gesto válido. O jogo pontua avanço, cobertura e combos. Cada região da junta tem um teto de pontos.
- **Zen** — escolha entre quatro peças e entre a tocha e três tipos de eletrodo. A inspeção é opcional e você pode voltar à peça após consultar os resultados.
- **Profissional** — três ordens e seleção surpresa, com controle manual do arco e critérios mais exigentes. As notas são calculadas para o jogo.

O progresso, as preferências, os recordes e a última ordem ficam no armazenamento local do navegador. No mesmo jogo aberto, retomar volta à bancada pausada. Após reabrir, a última peça recomeça. A segunda etapa da ordem final fica salva depois de aprovar a primeira.

## Controle da bancada

**Controles** pausa a execução para ajustar a câmera, a corrente e o som. **Voltar à peça** ou **Esc** fecha o painel. Em **Configurações → Interface da bancada**, escolha **Mínima** para recolher as instruções durante o passe.

- Em **Configurações → Sensibilidade da tocha**, ajuste de 50% a 250% para mouse ou trackpad. Um valor maior cobre mais distância com o mesmo gesto.
- Comece o gesto sobre a junta e arraste para soldar. Solte para encerrar o arco.
- Com eletrodo e assistência ligada, o jogo toca e afasta a vareta automaticamente no início do gesto. Ajuste a distância pelo controle na tela ou com **Q/E**.
- No controle manual, inicie com a distância em zero. Durante o gesto, afaste com **E** ou com outro dedo no controle de distância. **Q** aproxima. Contato prolongado pode grudar a vareta. Solte, afaste até 75 e volte a zero para reabrir.
- Solte o gesto antes de trocar a vareta. A missão **Troca de Vareta** exige consumir uma vareta inteira e substituí-la.
- Use **Girar Tubo** entre os passes para alcançar a circunferência. Use o picador para retirar a escória fria.

## GitHub Pages e instalação

No repositório, abra **Settings → Pages**. Em **Source**, selecione **Deploy from a branch** e escolha **main** e **/ (root)**. A mesma pasta estática atende o navegador, e o manifesto e o service worker permitem a instalação e o cache offline em navegadores compatíveis quando hospedada em HTTPS.

## Verificação

Com Node.js 24, `node --test` verifica regras da campanha, persistência e pontuação. `node tests/browser-smoke.mjs` abre o jogo direto do disco no Chrome e verifica o fluxo integrado. Acrescente `--full-pass` para executar um passe completo na primeira ordem. Use `CHROME_PATH` para indicar outro caminho para o executável.

O teste de navegador usa WebGL por software e não mede FPS em GPU móvel. O toque em Android físico e a calibração da campanha com jogadores precisam de validação separada.
