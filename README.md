# Welding Master 3D

Abra `index.html` com um duplo clique. Mantenha a pasta `assets` ao lado do arquivo. O jogo usa WebGL e os recursos da bancada são locais.

## Modos

- **Carreira** — dez ordens desbloqueadas em sequência. Cada missão apresenta nota mínima, meta de execução e recompensa. A última ordem tem duas peças. O primeiro sucesso em cada missão concede XP e créditos.
- **Arcade** — três desafios cronometrados. O relógio começa no primeiro gesto válido. O jogo pontua avanço, cobertura e combos. Cada região da junta tem um teto de pontos.
- **Zen** — escolha entre sete peças e conjuntos e entre a tocha e três tipos de eletrodo. A inspeção é opcional e você pode voltar à peça após consultar os resultados.
- **Profissional** — três ordens e seleção surpresa, com controle manual do arco e critérios mais exigentes. As notas são calculadas para o jogo.

O progresso, as preferências, os recordes e a última ordem ficam no armazenamento local do navegador. No mesmo jogo aberto, retomar volta à bancada pausada. Após reabrir, a última peça recomeça. A segunda etapa da ordem final fica salva depois de aprovar a primeira.

No modo **Zen**, escolha **Chapas soltas**, **Blocos maciços** ou **Barras retangulares**. Você pode soldar nas peças separadas. Use **Encaixar peças** para alinhar os biséis mantendo a abertura na raiz. Comece o cordão no fundo e faça passes em camadas até o topo. O indicador acompanha o trecho menos preenchido da união.

## Serviços e entregas

**Jogar primeiro serviço** abre a cantoneira quebrada. Em **Ordens de serviço**, também estão disponíveis a moldura em duas etapas, com escolha da ordem dos reparos, e o suporte tubular. Encaixe, preencha a junta e use **Inspecionar** para conferir a entrega. Em um serviço incompleto, **Voltar à peça** permite continuar o trabalho.

A oficina guarda a melhor imagem de cada serviço concluído. Na inspeção, **Baixar imagem do resultado** exporta o antes e depois em PNG. O **Desafio de bancada**, em **Modos de jogo**, oferece um passe de 50 segundos com peça e corrente fixas e guarda o recorde neste navegador.

## Controle da bancada

**Controles** pausa a execução para ajustar a câmera, a corrente e o som. **Voltar à peça** ou **Esc** fecha o painel. Em **Configurações → Interface da bancada**, escolha **Mínima** para recolher as instruções durante o passe.

- No celular, use **Mover** para deslizar pela peça e **Girar** para mudar o ângulo com um dedo. **+** e **−** ajustam a distância. **Vista geral** reenquadra a peça, inclusive na vertical. Selecione **Soldar** antes de tocar a junta para abrir o arco.
- Em **Configurações → Sensibilidade da tocha**, ajuste de 50% a 250% para mouse ou trackpad. Um valor maior cobre mais distância com o mesmo gesto.
- Em Carreira, Arcade e Profissional, comece sobre a junta indicada. Se sair dela, o arco apaga e você precisa pressionar de novo na junta. No Zen, você também pode soldar nas bordas e faces visíveis. Solte para encerrar o arco.
- Com eletrodo e assistência ligada, o jogo toca e afasta a vareta automaticamente no início do gesto. Ajuste a distância pelo controle na tela ou com **Q/E**.
- No controle manual, inicie com a distância em zero. Durante o gesto, afaste com **E** ou com outro dedo no controle de distância. **Q** aproxima. Contato prolongado pode grudar a vareta. Solte, afaste até 75 e volte a zero para reabrir.
- Solte o gesto antes de trocar a vareta. A missão **Troca de Vareta** exige consumir uma vareta inteira e substituí-la.
- Use **Girar Tubo** entre os passes para alcançar a circunferência. Use o picador para retirar a escória fria.

## GitHub Pages e instalação

No repositório, abra **Settings → Pages**. Em **Source**, selecione **Deploy from a branch** e escolha **main** e **/ (root)**. A mesma pasta estática atende o navegador, e o manifesto e o service worker permitem a instalação e o cache offline em navegadores compatíveis quando hospedada em HTTPS.

## Cloudflare Pages

Em **Workers & Pages → Create → Pages → Connect to Git**, escolha `Invictor13/GAME_SOLDA`. Use `main` como branch de produção, preset **None**, comando de build vazio e `/` como diretório de saída, com a raiz padrão do repositório. Acesse a URL HTTPS atribuída em `pages.dev` após a publicação. [Integração Git do Pages](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Publicação de HTML estático](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)

O jogo é servido como arquivos estáticos. O cache offline roda no navegador e as requisições aos arquivos estáticos não usam a cota de Workers do bot. [Preços do Pages](https://developers.cloudflare.com/pages/functions/pricing/)

Para validar uma atualização, conclua uma inspeção, confirme a retomada local, abra o jogo pelo endereço HTTPS e recarregue sem rede após a primeira visita. Depois de publicar uma nova versão do service worker, feche as abas do jogo para que ela possa assumir na próxima abertura. A limpeza atinge os caches do jogo. Os dados salvos ficam no `localStorage` daquele endereço. Ao trocar de domínio, como de GitHub Pages para `pages.dev`, o navegador mantém os dois salvamentos separados.

## Desempenho

**Configurações → Diagnóstico de desempenho** habilita a medição na sessão. Abra a bancada, execute um passe e volte às configurações. Também é possível ativar com `?perf`. O relatório guarda até 360 amostras por métrica. A latência mede da entrada processada pelo jogo até o envio do quadro, sem medir a apresentação física no monitor. Os valores de memória estimam os recursos da cena.

**Resposta da tocha** alterna entre Precisão, Realista e Assistido. A suavização visual não muda a posição da deposição. **Resolução dinâmica** reduz a resolução sob queda sustentada de desempenho e pode ser desligada para comparar perfis gráficos. A física avança em passos de 1/60 s, com até três passos por quadro para limitar a recuperação após travamentos.

### Comparação em laboratório

Uma execução pareada comparou o commit `55e3f50` com a versão otimizada no Chrome headless para Windows, com WebGL por software (SwiftShader), viewport 480 × 320, perfil Leve, flashes reduzidos e resolução dinâmica desativada. O roteiro enviou 42 posições sobre o mesmo chanfro em V. Tempos em milissegundos.

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Quadro médio | 1116,1 | 498,8 |
| Quadro p95 | 1191,6 | 708,3 |
| Raycast médio | 127,1 | 14,9 |
| Entrada até envio do quadro p95 | 1354,3 | 907,7 |
| Atualização média da malha | 0,8 | 46,7 |
| Atualização média do HUD | 8,9 | 14,0 |

A malha e o HUD ficaram mais caros nessa amostra. A execução teve pausas longas e variação alta. Estes valores não representam desempenho em hardware físico. Para repetir, execute `node tests/browser-smoke.mjs --benchmark` com `WELDING_BASELINE_URL` apontando para o `index.html` extraído do commit anterior.

## Verificação

Com Node.js 24, `node --test` verifica regras da campanha, persistência e pontuação. `node tests/browser-smoke.mjs` abre o jogo direto do disco no Chrome e verifica o fluxo integrado. Acrescente `--full-pass` para executar um passe completo na primeira ordem. Use `CHROME_PATH` para indicar outro caminho para o executável.

O teste de navegador usa WebGL por software e não mede FPS em GPU móvel. O toque em Android físico e a calibração da campanha com jogadores precisam de validação separada.
