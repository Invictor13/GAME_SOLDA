'use strict';

const arcade = (() => {
    const $ = id => document.getElementById(id);
    const storage = {
        getItem: key => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value)
    };
    const data = WeldingCampaign;
    const profile = data.loadSave(storage, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const modes = { jobs: 'Serviço', bench: 'Desafio', career: 'Carreira', arcade: 'Arcade', zen: 'Zen', pro: 'Profissional' };
    const finishes = {
        sand: { name: 'Oficina original', cost: 0, level: 1, color: 0x0b0f17 },
        copper: { name: 'Luz de cobre', cost: 75, level: 1, color: 0x2a1812 },
        blue: { name: 'Turno noturno', cost: 180, level: 2, color: 0x101e35 }
    };
    const challenges = [
        { name: 'Sprint no chanfro', piece: 0, process: 'torch', amp: 125, seconds: 40, brief: 'Cubra a junta com passes contínuos para pontuar.' },
        { name: 'Filete contra o relógio', piece: 1, process: 'E6013', amp: 125, seconds: 55, brief: 'Mantenha o arco estável entre as trocas de vareta.' },
        { name: 'Curva rápida', piece: 2, process: 'E6010', amp: 128, seconds: 60, brief: 'Combine centralização e avanço na curva.' }
    ];
    const jobs = [
        { name: 'Cantoneira quebrada', piece: 4, process: 'torch', amp: 115, brief: 'Encaixe as metades do suporte e preencha a raiz até o topo.', assembly: true },
        { name: 'Moldura empenada', piece: 6, secondPiece: 5, process: 'torch', amp: 120, brief: 'Escolha a ordem dos reparos. Complete as juntas da moldura em duas etapas.', assembly: true },
        { name: 'Suporte tubular', piece: 3, process: 'torch', amp: 115, brief: 'Gire a peça para alcançar a solda em toda a circunferência.', objective: 'coverage', target: 78 },
        { name: 'Reforço do carrinho da oficina', piece: 1, process: 'E6013', amp: 120, brief: 'A prateleira do carrinho soltou do reforço. Complete o filete e, se quiser, remova a escória por trechos para conferir o cordão.', objective: 'coverage', target: 70 }
    ];
    const bench = { name: 'Passe de bancada', piece: 0, process: 'torch', amp: 115, seconds: 50, brief: 'Cubra o chanfro em 50 segundos. O desafio usa sempre a mesma peça e corrente inicial.' };
    let jobBefore = null;
    let resultCard = null;
    const contracts = [
        { name: 'Filete lateral', piece: 1, process: 'E7018', amp: 125, minimum: 72, camera: 4, brief: 'Execute o filete com arco manual e controle térmico.' },
        { name: 'Reparo de tubulação', piece: 3, process: 'E6010', amp: 125, minimum: 76, camera: 2, brief: 'Gire o tubo entre os passes e mantenha o arco curto.' },
        { name: 'Chanfro curvo', piece: 2, process: 'E6013', amp: 120, minimum: 72, camera: 3, brief: 'Acompanhe a curva com arco manual e avanço uniforme.' }
    ];
    let active = null;
    let shownMenu = true;
    let trace = data.newTrace();
    let paused = true;
    let result = null;
    let selected = 0;
    let rod = freshRod();
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let workshop;
    let panelOpen = false;
    let dynamicResolution = WeldingPerformance.resolutionState();
    let pageKey = 'home';
    let lastStatus = '';

    const level = () => 1 + Math.floor(profile.xp / 300);
    function persist() { $('save-warning').hidden = data.save(storage, profile); }
    function freshRod() { return { remaining: 100, gap: 0, state: 'Pronto', held: false, dwell: 0, time: 0, quality: 1 }; }
    const electrode = () => active && data.rods[active.job.process];
    const difficulty = () => active?.mode === 'pro' ? 'simulation'
        : ['career', 'jobs'].includes(active?.mode) ? profile.settings.difficulty : 'standard';
    const forgivingMouse = () => ['career', 'jobs', 'zen'].includes(active?.mode) && difficulty() !== 'simulation';
    const assisted = () => difficulty() !== 'simulation' && profile.settings.assisted && !(mobileInput?.welding() && mobileProfile() === MobileControl.profiles.professional);
    const allowed = () => Boolean(active && !paused && !panelOpen && !shownMenu && !result && !contextLost && !document.hidden && $('tutorial-modal').classList.contains('hidden'));
    const isZen = () => active?.mode === 'zen';
    const mobileProfile = () => MobileControl.profiles[active?.mode === 'pro' ? 'professional' : profile.settings.mobileProfile] || MobileControl.profiles.casual;
    const sensitivity = () => {
        const value = Number(profile.settings.sensitivity);
        return Number.isFinite(value) ? Math.max(50, Math.min(250, value)) / 100 : 1;
    };
    const physical = key => electrode()?.[key] ?? (key === 'sparks' || key === 'pitch' ? 0 : 1);

    const graphicsProfile = () => WeldingPerformance.profiles[profile.settings.graphics] || WeldingPerformance.profiles.standard;
    const controlProfile = () => WeldingPerformance.controls[profile.settings.control] || WeldingPerformance.controls.precision;
    const smoothing = () => profile.settings.smoothing ?? controlProfile().smoothing;
    function applyResolution() {
        const quality = graphicsProfile();
        const cap = Math.min(window.devicePixelRatio || 1, quality.cap);
        const scale = profile.settings.adaptive ? dynamicResolution.scale() : 1;
        const ratio = Math.max(quality.floor, cap * scale);
        if (Math.abs(renderer.getPixelRatio() - ratio) >= .02) renderer.setPixelRatio(ratio);
    }
    function adaptResolution(ms) {
        if (profile.settings.adaptive && dynamicResolution.sample(ms)) applyResolution();
    }

    function applySettings() {
        document.body.classList.toggle('left-handed', profile.settings.leftHanded);
        soundEnabled = profile.settings.sound;
        $('sound-btn').textContent = soundEnabled ? '🔊' : '🔇';
        if (!soundEnabled) setArcSoundActive(false);
        document.body.classList.toggle('reduced-motion', reduced());
        document.body.classList.toggle('minimal-hud', profile.settings.minimal);
        if (!renderer) return;
        applyResolution();
        renderer.shadowMap.enabled = graphicsProfile().shadows;
        workshop?.move(0, 0);
        scene.background.setHex(finishes[profile.finish]?.color ?? finishes.sand.color);
        scene.fog.color.copy(scene.background);
    }

    function control(tag, text, parent) {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
    }
    function button(parent, name, action, detail) {
        const node = control('button', detail ? '' : name, parent);
        node.type = 'button';
        if (detail) {
            control('strong', name, node);
            control('small', detail, node);
        }
        node.addEventListener('click', action);
        return node;
    }
    function field(parent, label, options, value, onChange) {
        const wrapper = control('label', label, parent);
        const select = control('select', '', wrapper);
        for (const [key, name] of options) {
            const option = control('option', name, select);
            option.value = key;
        }
        select.value = value;
        select.addEventListener('change', () => onChange(select.value));
        return select;
    }
    function paragraph(parent, text) {
        control('p', text, parent).className = 'arc-description';
    }
    function primary(parent, text, action) {
        button(parent, text, action).className = 'arc-primary';
    }
    function group(parent, className) {
        const node = control('div', '', parent);
        node.className = className;
        return node;
    }
    function preview(piece) {
        workshop.select('career', piece);
    }
    function setControls(open) {
        cancelPointer();
        panelOpen = open;
        $('bench-toggle').setAttribute('aria-expanded', String(open));
        $('bench-toggle').textContent = open ? 'Voltar à peça' : 'Controles';
        document.body.classList.toggle('bench-options', open);
    }
    function drawWorkshop(dt) {
        workshop.draw(renderer, dt, reduced(), light(), window.innerWidth < 760, profile.finish);
    }
    function showMenu(open = true) {
        setTouchMode();
        setControls(false);
        shownMenu = open;
        paused = open;
        $('game-menu').hidden = !open;
        $('order-hud').hidden = open;
        $('bench-navigation').hidden = open;
        document.body.classList.toggle('menu-open', open);
        if (open) {
            workshop.showDeliveries(profile.completedJobs);
            document.body.classList.remove('mode-zen');
            $('inspect-modal').classList.add('hidden');
            homepage();
            $('mode-menu').querySelector('[data-page=career]').focus({ preventScroll: true });
        } else {
            document.body.classList.toggle('mode-zen', isZen());
            $('bench-toggle').focus({ preventScroll: true });
        }
    }
    function homepage() {
        pageKey = 'home';
        workshop.select('home', 0);
        $('game-menu').classList.remove('menu-inner', 'menu-career');
        $('game-menu').scrollTop = 0;
        $('mode-menu').hidden = false;
        $('menu-page').hidden = true;
        $('resume-game').hidden = !profile.last;
        $('mode-menu').querySelector('[data-page="career"] strong').textContent =
            profile.records[0]?.passed ? 'Continuar carreira' : 'Iniciar carreira';
    }
    function showPage(key) {
        pageKey = key;
        workshop.select(key === 'workshop' ? 'workshop' : 'career');
        $('game-menu').classList.add('menu-inner');
        $('game-menu').classList.toggle('menu-career', key === 'career');
        $('game-menu').scrollTop = 0;
        $('menu-page').classList.remove('page-enter');
        void $('menu-page').offsetWidth;
        $('menu-page').classList.add('page-enter');
        $('mode-menu').hidden = true;
        $('menu-page').hidden = false;
        const titles = { ...modes, jobs: 'Ordens de serviço', modes: 'Modos de jogo', workshop: 'Oficina e equipamentos', stats: 'Estatísticas e conquistas', settings: 'Configurações' };
        $('menu-title').textContent = titles[key];
        const parent = $('menu-content');
        parent.replaceChildren();
        if (key === 'jobs') {
            const rows = group(parent, 'arc-options');
            jobs.forEach((job, index) => {
                const saved = profile.completedJobs[index];
                button(rows, job.name, () => start('jobs', index),
                    saved ? `Melhor entrega: ${saved.grade}/100` : job.brief);
            });
            paragraph(parent, 'Na moldura, você escolhe qual reparo fazer primeiro.');
            button(parent, 'Moldura: começar pela chapa de reforço', () => start('jobs', 1, 'torch', 0, null, true)).className = 'game-link';
        } else if (key === 'career') {
            const max = data.unlocked(profile);
            selected = max;
            const layout = group(parent, 'career-layout');
            const rail = group(layout, 'career-rail');
            const total = data.missions.filter((_, i) => profile.records[i]?.passed).length;
            control('p', `${total} de 10 ordens concluídas`, rail).className = 'career-progress';
            const options = group(rail, 'mission-list');
            const detail = group(layout, 'mission-detail');
            const image = control('canvas', '', detail);
            image.className = 'mission-preview';
            image.width = 384;
            image.height = 144;
            image.setAttribute('role', 'img');
            const name = control('h3', '', detail);
            const piece = control('p', '', detail);
            piece.className = 'mission-piece';
            const brief = control('p', '', detail);
            brief.className = 'arc-description';
            const requirements = control('p', '', detail);
            const reward = control('p', '', detail);
            reward.className = 'mission-reward';
            const chapters = { 0: 'Fundamentos', 4: 'Controle de processo', 7: 'Ordens avançadas' };
            const cards = data.missions.map((job, i) => {
                if (chapters[i]) control('h3', chapters[i], options);
                const record = profile.records[i];
                const locked = i > max;
                const summary = record?.passed ? `Concluída · Melhor nota ${record.grade}${record.star ? ' · ★' : ''}`
                    : locked ? `Conclua ${data.missions[i - 1].name}` : record ? `Melhor nota ${record.grade} · Tentar novamente` : 'Disponível';
                const card = button(options, job.name, () => selectMission(i), summary);
                card.className = 'mission-card';
                card.dataset.index = String(i);
                card.dataset.state = record?.passed ? 'complete' : locked ? 'locked' : 'current';
                card.dataset.marker = record?.passed ? '✓' : locked ? '🔒' : String(i + 1).padStart(2, '0');
                card.disabled = locked;
                if (locked) card.title = summary;
                return card;
            });
            function selectMission(i) {
                selected = i;
                const job = data.missions[i];
                name.textContent = job.name;
                piece.textContent = STRUCTURES[job.piece].name.replace(/^\d+\. /, '') + ' · ' + (job.process === 'torch' ? 'Tocha' : job.process);
                brief.textContent = job.brief;
                requirements.textContent = `Nota mínima ${job.minimum} · ${data.labels[job.objective]} ≥ ${job.target}${job.objective === 'replacements' ? '' : '%'}`;
                reward.textContent = profile.records[i]?.passed ? 'Recompensa já recebida' : `+${job.xp} XP · +${job.credits} créditos`;
                cards.forEach((card, index) => card.setAttribute('aria-pressed', String(index === i)));
                preview(job.piece);
                image.setAttribute('aria-label', 'Prévia 3D de ' + STRUCTURES[job.piece].name.replace(/^\d+\. /, ''));
                workshop.thumbnail(renderer, image);
            }
            primary(detail, 'Iniciar ordem de serviço →', () => start('career', selected));
            selectMission(max);
            const list = options.getBoundingClientRect();
            const initial = cards[max].getBoundingClientRect();
            if (initial.bottom > list.bottom) options.scrollTop = initial.top - list.top - 32;
        } else if (key === 'modes') {
            const options = group(parent, 'arc-options');
            button(options, 'Desafio de bancada', () => start('bench', 0),
                `50 segundos · Recorde local ${profile.benchBest[0] || 0}`);
            const summaries = { arcade: 'Desafios contra o relógio', zen: 'Bancada livre', pro: 'Ordens com controle manual' };
            for (const [mode, summary] of Object.entries(summaries)) {
                const option = button(options, modes[mode], () => showPage(mode), summary);
                option.dataset.page = mode;
            }
        } else if (key === 'arcade' || key === 'pro') {
            const list = key === 'arcade' ? challenges : contracts;
            paragraph(parent, key === 'arcade' ? 'Pontos por avanço regular em regiões diferentes da junta. Termine antes do relógio zerar.' : 'Use controle manual da distância. Os parâmetros e as avaliações são recreativos.');
            const options = group(parent, 'arc-options');
            const description = control('p', '', parent);
            description.className = 'arc-description';
            const cards = list.map((job, i) => button(options, job.name, () => selectContract(i), key === 'arcade'
                ? `${job.seconds} s · Recorde ${profile.arcade[i] ?? 0}`
                : `${job.process} · Nota mínima ${job.minimum}`));
            function selectContract(i) {
                selected = i;
                description.textContent = list[i].brief;
                cards.forEach((card, index) => card.setAttribute('aria-pressed', String(index === i)));
                preview(list[i].piece);
            }
            primary(parent, 'Começar desafio', () => start(key, selected));
            if (key === 'pro') {
                button(parent, 'Ordem surpresa', () => start('pro', Math.floor(Math.random() * list.length))).className = 'game-link';
            }
            selectContract(0);
        } else if (key === 'zen') {
            let piece = 0;
            let process = 'torch';
            paragraph(parent, 'Escolha a peça e o processo. A inspeção é opcional.');
            const fields = group(parent, 'arc-fields');
            field(fields, 'Peça', STRUCTURES.map((spec, index) => [String(index), spec.name]), '0', value => {
                piece = Number(value);
                preview(piece);
            });
            field(fields, 'Processo', [['torch', 'Tocha original'], ...Object.keys(data.rods).map(key => [key, `Eletrodo ${key}`])], process, value => { process = value; });
            field(fields, 'Assistência de arco', [['true', 'Ligada'], ['false', 'Manual']], String(profile.settings.assisted), value => {
                profile.settings.assisted = value === 'true';
                persist();
            });
            primary(parent, 'Entrar na bancada', () => start('zen', piece, process));
            preview(piece);
        } else if (key === 'workshop') {
            paragraph(parent, `Nível ${level()} · ${profile.credits} créditos · ${profile.xp} XP`);
            paragraph(parent, 'Equipamentos disponíveis na solda livre: tocha, porta-eletrodo e varetas E6013, E7018 e E6010.');
            const gallery = group(parent, 'job-gallery');
            control('h3', 'Peças em exposição', gallery);
            for (const [index, entry] of Object.entries(profile.completedJobs)) {
                if (!jobs[index] || !entry.image) continue;
                const section = control('figure', '', gallery);
                const img = control('img', '', section);
                img.src = entry.image;
                img.alt = `Antes e depois de ${jobs[index].name}`;
                control('figcaption', `${jobs[index].name} · ${entry.grade}/100`, section);
            }
            if (!gallery.querySelector('figure')) paragraph(gallery, 'Entregue um serviço para colocar a peça em exposição.');
            const options = group(parent, 'arc-options');
            for (const [key, finish] of Object.entries(finishes)) {
                const owned = profile.owned.includes(key);
                const node = button(options, finish.name, () => {
                    if (!owned) {
                        profile.credits -= finish.cost;
                        profile.owned.push(key);
                    }
                    profile.finish = key;
                    persist();
                    applySettings();
                    showPage('workshop');
                }, owned ? (profile.finish === key ? 'Em uso' : 'Equipar') : `Nível ${finish.level} · ${finish.cost} créditos`);
                node.disabled = !owned && (profile.credits < finish.cost || level() < finish.level);
            }
        } else if (key === 'stats') {
            const medals = Object.values(profile.records).filter(record => record.passed);
            paragraph(parent, `Campanha: ${medals.length}/10 concluídas · ${medals.filter(record => record.star).length} estrelas.`);
            paragraph(parent, `Nível ${level()} · ${profile.xp} XP · ${profile.credits} créditos · ${profile.finishes} inspeções.`);
            paragraph(parent, `Melhor Arcade: ${Math.max(0, ...Object.values(profile.arcade))} pontos · Melhor Profissional: ${Math.max(0, ...Object.values(profile.pro))}/100.`);
            paragraph(parent, medals.length === 10 ? 'Conquista: Mestre do Arco.' : medals.length ? 'Conquista: Primeira entrega.' : 'Conclua Primeiro Arco para ganhar sua primeira conquista.');
            if (medals.length < 10) paragraph(parent, `Próxima ordem: ${data.missions[data.unlocked(profile)].name}.`);
        } else {
            const fields = group(parent, 'arc-fields');
            const setting = (label, key, choices, boolean = false) => field(fields, label, choices, String(profile.settings[key]), value => {
                profile.settings[key] = boolean ? value === 'true' : value;
                if (key === 'graphics' || key === 'adaptive') dynamicResolution = WeldingPerformance.resolutionState();
                applySettings();
                persist();
            });
            setting('Áudio', 'sound', [['true', 'Ligado'], ['false', 'Desligado']], true);
            setting('Gráficos', 'graphics', [['low', 'Leve'], ['standard', 'Equilibrado'], ['high', 'Alto']]);
            setting('Movimento e flashes reduzidos', 'reduced', [['false', 'Desligados'], ['true', 'Ligados']], true);
            setting('Interface da bancada', 'minimal', [['false', 'Padrão'], ['true', 'Mínima']], true);
            setting('Dificuldade na Carreira e nos Serviços', 'difficulty', [['assisted', 'Assistida'], ['standard', 'Padrão'], ['simulation', 'Simulação']]);
            setting('Lado do botão Soldar', 'leftHanded', [['false', 'Direito'], ['true', 'Esquerdo']], true);
            setting('Vibração ao perder o arco', 'vibration', [['true', 'Ligada'], ['false', 'Desligada']], true);
            setting('Abertura assistida no mouse e no toque', 'assisted', [['true', 'Ligada'], ['false', 'Manual']], true);
            field(fields, 'Controle no celular', [['casual', 'Casual'], ['precision', 'Precisão'], ['professional', 'Profissional']], profile.settings.mobileProfile, value => {
                profile.settings.mobileProfile = value;
                persist();
            });
            const sensitivityField = group(fields, 'sensitivity-field');
            const label = control('label', 'Sensibilidade da tocha', sensitivityField);
            label.htmlFor = 'aim-sensitivity';
            const value = control('output', '', label);
            value.htmlFor = 'aim-sensitivity';
            const slider = control('input', '', sensitivityField);
            slider.id = 'aim-sensitivity';
            slider.type = 'range';
            slider.min = '50';
            slider.max = '250';
            slider.step = '5';
            slider.value = String(Math.round(sensitivity() * 100));
            slider.setAttribute('aria-describedby', 'aim-sensitivity-help');
            const help = control('small', 'Mouse e trackpad. Aumente para percorrer a junta com menos movimento.', sensitivityField);
            help.id = 'aim-sensitivity-help';
            function syncSensitivity() {
                value.textContent = slider.value + '%';
                slider.setAttribute('aria-valuetext', slider.value + ' por cento');
            }
            syncSensitivity();
            slider.addEventListener('input', () => {
                profile.settings.sensitivity = Number(slider.value);
                syncSensitivity();
                persist();
            });
            field(fields, 'Resposta da tocha', [['precision', 'Precisão'], ['realistic', 'Realista'], ['assisted', 'Assistido']], profile.settings.control, value => {
                profile.settings.control = value;
                profile.settings.smoothing = null;
                smoothingSlider.value = smoothing();
                syncSmoothing();
                persist();
            });
            const smoothingField = group(fields, 'sensitivity-field');
            const smoothingLabel = control('label', 'Suavização visual da tocha', smoothingField);
            smoothingLabel.htmlFor = 'torch-smoothing';
            const smoothingValue = control('output', '', smoothingLabel);
            const smoothingSlider = control('input', '', smoothingField);
            smoothingSlider.id = 'torch-smoothing';
            smoothingSlider.type = 'range';
            smoothingSlider.min = '0';
            smoothingSlider.max = '100';
            smoothingSlider.value = smoothing();
            function syncSmoothing() { smoothingValue.textContent = smoothingSlider.value + '%'; }
            syncSmoothing();
            smoothingSlider.addEventListener('input', () => {
                profile.settings.smoothing = Number(smoothingSlider.value);
                syncSmoothing();
                persist();
            });
            control('small', 'Suaviza a animação da ferramenta. O ponto de deposição segue a mira lógica.', smoothingField);
            setting('Resolução dinâmica', 'adaptive', [['true', 'Ligada'], ['false', 'Desligada']], true);
            field(fields, 'Diagnóstico de desempenho', [['false', 'Desligado'], ['true', 'Ligado nesta sessão']], String(WeldingPerformance.enabled()), value => {
                WeldingPerformance.enable(value === 'true');
                report.hidden = value !== 'true';
                WeldingPerformance.updateReadout();
            });
            const report = control('pre', '', parent);
            report.id = 'performance-readout';
            report.hidden = !WeldingPerformance.enabled();
            WeldingPerformance.updateReadout();
            paragraph(parent, 'Ajuste a distância pelo controle na tela ou com Q e E. No modo Profissional, o arco é manual.');
        }
        $('menu-title').focus({ preventScroll: true });
    }

    function start(mode, index, process = 'torch', stage = 0, previous = null, reverse = false) {
        const job = mode === 'career' ? data.missions[index] : mode === 'arcade' ? challenges[index]
            : mode === 'pro' ? contracts[index] : mode === 'jobs' ? jobs[index] : mode === 'bench' ? bench : { name: 'Solda livre', piece: index, process, brief: 'Solde no seu ritmo.' };
        if (!job || (mode === 'career' && index > data.unlocked(profile))) return;
        active = { mode, index, job, stage, previous, reverse, remaining: job.seconds ?? 0, running: false };
        profile.last = { mode, index, process, stage, previous, reverse };
        persist();
        loadStructure(Boolean(stage) !== reverse ? job.secondPiece : job.piece);
        setCameraPreset(camera.aspect < 1 ? 1 : job.camera || 1);
        if (mode === 'jobs' || mode === 'bench') jobBefore = captureBenchPhoto();
        $('inspect-modal').classList.add('hidden');
        showMenu(false);
        renderHud();
    }
    function chooseNextFreePiece() {
        if (!isZen()) return;
        start('zen', (currentLevel + 1) % STRUCTURES.length, active.job.process);
    }
    function onLoadPiece() {
        result = null;
        resultCard = null;
        trace = data.newTrace();
        rod = freshRod();
        $('amp-slider').disabled = active?.mode === 'bench';
        if (active) {
            active.remaining = active.job.seconds ?? 0;
            active.running = false;
            if (active.job.amp) {
                $('amp-slider').value = active.job.amp;
                onAmpChange(active.job.amp);
            }
        }
        renderHud();
    }
    function resume() {
        const last = profile.last;
        if (!last) return;
        if (active && !result) showMenu(false);
        else start(last.mode, last.index, last.process, last.stage, last.previous, last.reverse || false);
    }
    function renderHud() {
        if (!active) return;
        $('order-title').textContent = `${modes[active.mode]} · ${active.job.name}${active.job.secondPiece ? ` · ${active.stage + 1}/2` : ''}`;
        const target = active.job.objective;
        $('order-text').textContent = active.job.brief + (target ? ` ${data.labels[target]} ≥ ${active.job.target}${target === 'replacements' ? '' : '%'}.` : '');
        $('current-amp').textContent = `${amperage} A`;
        $('order-clock').textContent = active.job.seconds ? `${Math.ceil(active.remaining)} s` :
            active.job.minimum ? `Meta ${active.job.minimum}` : '';
        $('rod-controls').hidden = !electrode();
        $('free-piece').hidden = !isZen();
        $('chip-section').hidden = active.mode !== 'jobs' || !electrode();
        if (!electrode()) return;
        const status = `${active.job.process} · ${Math.ceil(rod.remaining)}% · ${rod.state}`;
        if (lastStatus !== status) {
            $('rod-status').textContent = status;
            lastStatus = status;
        }
        if (Number($('arc-gap').value) !== rod.gap) $('arc-gap').value = rod.gap;
        $('replace-rod').disabled = rod.held || rod.remaining >= 100;
        $('rod-help').textContent = assisted() ? 'Pressione a junta para abrir o arco. Use o controle para corrigir a distância.'
            : 'Com distância em 0, pressione a junta. Afaste até a faixa estável com o controle ou E. Q aproxima.';
    }

    function arcOn(on) {
        if (isWelding === on) return;
        isWelding = on;
        setArcSoundActive(on);
        if (!on) {
            if (mobileInput?.welding() && rod.held && profile.settings.vibration) navigator.vibrate?.(28);
            flushPendingSlagPatch();
        }
    }
    function begin() {
        if (!allowed()) return;
        active.running = true;
        if (!electrode()) {
            arcOn(true);
            return;
        }
        if (rod.remaining <= 0 || rod.state === 'Grudado') return;
        rod.held = true;
        rod.time = 0;
        rod.dwell = 0;
        if (assisted()) rod.gap = 0;
        rod.state = rod.gap <= 13 ? 'Contato' : 'Toque a peça';
        renderHud();
    }
    function stop() {
        rod.held = false;
        if (rod.state !== 'Grudado') rod.state = rod.remaining > 0 ? 'Pronto' : 'Esgotada';
        arcOn(false);
        renderHud();
    }
    function replace() {
        if (!electrode() || rod.held || rod.remaining >= 100) return;
        if (rod.remaining <= 0) trace.replacements++;
        rod = freshRod();
        renderHud();
        playSlagPopTick();
    }
    function setGap(value) {
        rod.gap = Math.max(0, Math.min(100, value));
        if (rod.state === 'Grudado' && !rod.held && rod.gap >= 75) rod.state = 'Pronto';
        renderHud();
    }
    function step(dt, clockDt) {
        if (!allowed()) return;
        if (active.job.seconds && active.running) {
            active.remaining = Math.max(0, active.remaining - clockDt);
            if (!active.remaining) {
                inspectWeld();
                return;
            }
        }
        const props = electrode();
        const previousQuality = rod.quality;
        if (!props || !rod.held || !aimUV.valid) {
            if (props && rod.held && !aimUV.valid) arcOn(false);
            return;
        }
        rod.time += dt;
        if (assisted() && rod.state === 'Contato' && rod.time > 0.13 && rod.gap <= 13) {
            rod.gap = (props.minimum + props.maximum) / 2;
        }
        if (rod.gap <= 13 && rod.state !== 'Grudado') {
            rod.state = 'Contato';
            rod.dwell += dt;
            if (rod.dwell >= 0.65) {
                rod.state = 'Grudado';
                showLiveFeedback('Vareta grudada. Solte e aumente a distância até 75 para liberar.', 'text-amber-300');
            }
        } else {
            rod.dwell = 0;
        }
        const canIgnite = ['Contato', 'Arco estável', 'Arco curto', 'Arco longo'].includes(rod.state);
        const minimum = props.minimum + (active.mode === 'pro' ? 5 : 0);
        const maximum = props.maximum - (active.mode === 'pro' ? 5 : 0);
        if (canIgnite && rod.gap > 13 && rod.gap < 92) {
            rod.state = rod.gap < minimum ? 'Arco curto' : rod.gap > maximum ? 'Arco longo' : 'Arco estável';
            rod.quality = rod.state === 'Arco estável' ? 1 : 0.52;
            rod.remaining = Math.max(0, rod.remaining - props.consumption * dt * (amperage / 120));
            if (!rod.remaining) rod.state = 'Esgotada';
        } else if (rod.gap >= 92 && canIgnite) {
            rod.state = 'Toque a peça';
        }
        arcOn(rod.remaining > 0 && ['Arco estável', 'Arco curto', 'Arco longo'].includes(rod.state));
        if (isWelding && previousQuality !== rod.quality) setArcSoundActive(true);
    }

    function sample(u, offset, dt, inGroove, speed) {
        if (!active) return 0;
        const spec = STRUCTURES[currentLevel];
        const position = (u - spec.uMin) / (spec.uMax - spec.uMin);
        const centered = inGroove && (active.mode !== 'pro' || Math.abs(offset) < spec.grooveHalfWidth * 0.72);
        const paced = speed >= (active.mode === 'pro' ? 0.6 : 0.42) && speed <= (active.mode === 'pro' ? 2.55 : 3.1);
        return data.traceSample(trace, position, {
            dt, centered, paced: paced && centered, stability: electrode() ? rod.quality : 1,
            offset: Math.min(1, Math.abs(offset) / spec.grooveHalfWidth), combo
        });
    }

    function finish(volume, precision, thermal) {
        if (!active || result) return result;
        paused = true;
        const metrics = data.inspect(trace, { volume, precision, thermal });
        const { job, mode, stage, previous } = active;
        const twoStages = job.secondPiece !== undefined;
        const finalGrade = previous === null ? metrics.grade : Math.min(previous.grade, metrics.grade);
        const passed = data.passes(job, metrics, finalGrade) && (!job.assembly || volume >= 90);
        const star = passed && job.objective && metrics[job.objective] >= data.thresholds[job.objective];
        const anotherStage = twoStages && stage === 0 && passed;
        const objective = job.objective && {
            label: data.labels[job.objective], required: job.target, achieved: metrics[job.objective],
            suffix: job.objective === 'replacements' ? '' : '%'
        };
        const record = job.seconds ? Math.max(0, Math.round(score + metrics.coverage * 12 + metrics.pace * 4)) : 0;
        const earned = mode === 'career' && passed && !anotherStage && !profile.records[active.index]?.passed;
        const reward = earned ? `+${job.xp} XP · +${job.credits} créditos` : '';
        profile.finishes++;
        if (anotherStage) profile.last = { mode, index: active.index, process: job.process, stage: 1, previous: metrics, reverse: active.reverse };
        if (mode === 'career' && !anotherStage) data.recordMission(profile, active.index, finalGrade, passed, star);
        if (mode === 'arcade') profile.arcade[active.index] = Math.max(profile.arcade[active.index] ?? 0, record);
        const best = profile.benchBest[0] || 0;
        const compare = mode === 'bench' && best > 0 ? record - best : null;
        const splits = [0, 1, 2, 3].map(i => Math.round(trace.points.slice(i * 10, (i + 1) * 10).reduce((sum, value) => sum + value, 0)));
        const differences = mode === 'bench' && Array.isArray(profile.benchSplits)
            ? splits.map((value, i) => value - profile.benchSplits[i]) : null;
        if (mode === 'bench' && record > best) {
            profile.benchBest[0] = record;
            profile.benchSplits = splits;
        }
        if (mode === 'jobs' || mode === 'bench') {
            resultCard = createDeliveryCard(job.name, mode === 'bench' ? `${record} pontos` : `${finalGrade}/100`, jobBefore, captureBenchPhoto());
            const prior = profile.completedJobs[active.index];
            if (mode === 'jobs' && passed && !anotherStage && (!prior || finalGrade >= prior.grade)) {
                profile.completedJobs[active.index] = { grade: finalGrade, image: resultCard.toDataURL('image/jpeg', .78) };
            }
        }
        if (mode === 'pro') profile.pro[active.index] = Math.max(profile.pro[active.index] ?? 0, metrics.grade);
        persist();
        const coverage = Array.from(trace.bins, seconds => Math.min(1, seconds / .08));
        result = { metrics, finalGrade, passed, anotherStage, star, record, objective, reward, coverage, compare, differences, medal: data.medal(finalGrade) };
        return result;
    }
    function retry() {
        if (!active) return;
        start(active.mode, active.index, active.job.process, active.stage, active.previous, active.reverse);
    }
    function continuePiece() {
        if (result && !active.job.seconds && (!result.passed || isZen())) {
            result = null;
            paused = false;
            $('inspect-modal').classList.add('hidden');
        }
    }
    function advance() {
        if (isZen() || (active?.mode === 'jobs' && result && !result.passed)) continuePiece();
        else if (result?.anotherStage) start(active.mode, active.index, active.job.process, 1, result.metrics, active.reverse);
        else if (active?.mode === 'jobs' && result?.passed && active.index + 1 < jobs.length) start('jobs', active.index + 1);
        else if (active?.mode === 'career' && result?.passed && active.index + 1 < data.missions.length) start('career', active.index + 1);
        else showMenu();
    }
    function key(event) {
        if (!allowed() || !electrode() || !['q', 'e'].includes(event.key.toLowerCase())) return;
        setGap(rod.gap + (event.key.toLowerCase() === 'e' ? 8 : -8));
        event.preventDefault();
    }
    function ready() {
        workshop = createWorkshopView();
        applySettings();
        document.querySelectorAll('#mode-menu [data-page]').forEach(node => {
            const key = node.dataset.page;
            node.addEventListener('click', () => {
                if (node.id === 'first-service') start('jobs', 0);
                else showPage(key);
            });
            const focusScene = () => { if (pageKey === 'home') workshop.select(key, 0); };
            const restoreScene = () => { if (pageKey === 'home') workshop.select('home', 0); };
            node.addEventListener('pointerenter', focusScene);
            node.addEventListener('pointerleave', restoreScene);
            node.addEventListener('focus', focusScene);
            node.addEventListener('blur', restoreScene);
        });
        $('game-menu').addEventListener('pointermove', event => {
            if (event.pointerType === 'mouse') workshop.move(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2);
        });
        $('game-menu').addEventListener('pointerleave', () => workshop.move(0, 0));
        $('menu-back').addEventListener('click', () => {
            if (['arcade', 'zen', 'pro'].includes(pageKey)) showPage('modes');
            else {
                homepage();
                $('mode-menu').querySelector('[data-page=career]').focus();
            }
        });
        $('bench-toggle').addEventListener('click', () => setControls(!panelOpen));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panelOpen) {
                setControls(false);
                $('bench-toggle').focus();
            }
        });
        document.addEventListener('click', event => {
            const target = event.target.closest('button');
            if (target?.closest('#game-menu, #bench-navigation, #bench-header, #bench-footer, #inspect-modal')) playMenuFeedback();
        }, true);
        motionPreference.addEventListener('change', applySettings);
        $('resume-game').addEventListener('click', resume);
        $('leave-game').addEventListener('click', () => showMenu());
        $('replace-rod').addEventListener('click', replace);
        $('arc-gap').addEventListener('input', event => setGap(Number(event.target.value)));
        document.addEventListener('keydown', key);
        document.addEventListener('visibilitychange', () => { lastFrameTime = performance.now(); });
        persist();
        homepage();
    }
    function soundChanged() {
        profile.settings.sound = soundEnabled;
        persist();
    }
    const current = () => active;
    const menu = () => shownMenu;
    const distance = () => rod.gap;
    const rodLength = () => rod.remaining;
    const reduced = () => profile.settings.reduced || motionPreference.matches;
    const stability = () => electrode() ? rod.quality : 1;
    const light = () => profile.settings.graphics === 'low';
    return {
        ready, drawWorkshop, card: () => resultCard, downloadCard() {
            if (!resultCard) return;
            const link = document.createElement('a');
            link.href = resultCard.toDataURL('image/png');
            link.download = 'welding-master-resultado.png';
            link.click();
        }, sensitivity, mobileProfile, setGap, controlProfile, smoothing, graphicsProfile, adaptResolution, controlsOpen: () => panelOpen, onLoadPiece, chooseNextFreePiece, allowed, begin, stop, step, sample, renderHud, physical, electrode,
        distance, rodLength, reduced, stability, light, finish, retry, advance, current, menu, isZen, soundChanged,
        difficulty, forgivingMouse, continuePiece, vibration: () => profile.settings.vibration
    };
})();
