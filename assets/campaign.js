'use strict';

const WeldingCampaign = (() => {
    const requirements = [42, 43, 70, 64, 24, 72, 1, 80, 78, 34];
    const missions = [
        ['Primeiro Arco', 0, 'torch', 115, 40, 'Cubra o chanfro de ponta a ponta.', 'coverage'],
        ['Mão Firme', 0, 'torch', 110, 50, 'Mantenha o avanço na faixa ideal.', 'pace'],
        ['Junta em T', 1, 'torch', 125, 55, 'Preencha o filete sem sair da junta.', 'precision'],
        ['Controle Térmico', 1, 'torch', 120, 60, 'Divida o passe para evitar superaquecimento.', 'thermal'],
        ['Chanfro em V', 0, 'torch', 130, 65, 'Deposite várias camadas ao longo do chanfro.', 'volume'],
        ['Primeiro Eletrodo', 0, 'E6013', 115, 65, 'Abra o arco e mantenha a distância do eletrodo.', 'stability'],
        ['Troca de Vareta', 1, 'E7018', 125, 70, 'Consuma uma vareta e conclua o trabalho com outra.', 'replacements'],
        ['Curva Difícil', 2, 'E6010', 115, 75, 'Acompanhe a curva sem perder o centro.', 'precision'],
        ['Tubulação', 3, 'E7018', 125, 80, 'Use Girar Tubo entre passes e cubra toda a circunferência.', 'coverage'],
        ['Mestre do Arco', 2, 'E7018', 125, 85, 'Entregue o chanfro curvo e a junta circular na mesma ordem.', 'volume', 3]
    ].map(([name, piece, process, amp, minimum, brief, objective, secondPiece], index) => ({
        name, piece, process, amp, minimum, brief, objective, secondPiece, target: requirements[index],
        xp: 80 + index * 20, credits: 50 + index * 15
    }));

    const rods = {
        E6013: { minimum: 25, maximum: 71, consumption: 10, deposition: 1.05, heat: 0.90, sparks: 2, pitch: 460 },
        E7018: { minimum: 32, maximum: 64, consumption: 12, deposition: 1.18, heat: 1.04, sparks: 1, pitch: 340 },
        E6010: { minimum: 38, maximum: 77, consumption: 14, deposition: 0.94, heat: 1.16, sparks: 4, pitch: 650 }
    };
    const thresholds = { coverage: 92, pace: 78, precision: 94, thermal: 95, volume: 70, stability: 88, replacements: 2 };
    const labels = {
        coverage: 'Cobertura', pace: 'Avanço ideal', precision: 'Centralização', thermal: 'Controle térmico',
        volume: 'Preenchimento', stability: 'Estabilidade do arco', replacements: 'Varetas esgotadas e trocadas'
    };
    function passes(job, metrics, grade = metrics.grade) {
        return grade >= (job.minimum ?? 0) && (!job.objective || metrics[job.objective] >= job.target);
    }
    const saveKey = 'welding-master-arcade-v1';
    const loadSave = (storage, prefersReducedMotion = false) => {
        const base = {
            records: {}, arcade: {}, pro: {}, completedJobs: {}, benchBest: {}, xp: 0, credits: 0, finishes: 0,
            owned: ['sand'], finish: 'sand', last: null,
            settings: { sound: true, graphics: 'standard', reduced: prefersReducedMotion, assisted: true, minimal: false, sensitivity: 100, control: 'precision', smoothing: null, adaptive: true }
        };
        try {
            const saved = JSON.parse(storage.getItem(saveKey));
            if (saved && typeof saved === 'object') return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
        } catch {}
        return base;
    };
    const save = (storage, profile) => {
        try { storage.setItem(saveKey, JSON.stringify(profile)); return true; }
        catch { return false; }
    };
    const unlocked = profile => {
        const index = missions.findIndex((_, i) => !profile.records[i]?.passed);
        return index < 0 ? missions.length - 1 : index;
    };
    const medal = grade => grade >= 90 ? 'Ouro' : grade >= 70 ? 'Prata' : grade >= 40 ? 'Bronze' : '';
    function recordMission(profile, index, grade, passed, star) {
        const mission = missions[index];
        if (!mission || index > unlocked(profile)) return;
        const previous = profile.records[index];
        profile.records[index] = {
            grade: Math.max(previous?.grade ?? 0, grade),
            passed: Boolean(previous?.passed || passed),
            star: Boolean(previous?.star || star)
        };
        if (passed && !previous?.passed) {
            profile.xp += mission.xp;
            profile.credits += mission.credits;
        }
    }
    const newTrace = () => ({
        bins: new Float32Array(40), points: new Float32Array(40),
        elapsed: 0, smooth: 0, stable: 0, offset: 0, replacements: 0
    });
    function traceSample(trace, position, { dt, centered, paced, stability, offset, combo }) {
        trace.elapsed += dt;
        trace.smooth += paced ? dt : 0;
        trace.stable += stability * dt;
        trace.offset += Math.abs(offset) * dt;
        if (!centered) return 0;
        const region = Math.max(0, Math.min(39, Math.floor(position * 40)));
        trace.bins[region] = Math.min(0.12, trace.bins[region] + dt);
        if (!paced) return 0;
        const points = Math.max(0, Math.min(80 - trace.points[region], dt * 120 * combo * stability));
        trace.points[region] += points;
        return points;
    }
    function inspect(trace, { volume, precision, thermal }) {
        const pct = value => Math.round(value / (trace.elapsed || 1) * 100);
        const coverage = Math.round(trace.bins.reduce((total, seconds) => total + Math.min(1, seconds / 0.08), 0) / 40 * 100);
        const pace = pct(trace.smooth);
        const stability = pct(trace.stable);
        const regularity = Math.round(pace * 0.6 + Math.max(0, 100 - pct(trace.offset)) * 0.4);
        const grade = trace.elapsed > 0.12
            ? Math.round(volume * 0.28 + coverage * 0.32 + precision * 0.16 + thermal * 0.12 + regularity * 0.07 + stability * 0.05)
            : 0;
        return { grade, volume, precision, thermal, coverage, pace, stability, regularity, replacements: trace.replacements };
    }
    return { missions, rods, thresholds, labels, loadSave, save, unlocked, medal, passes, recordMission, newTrace, traceSample, inspect };
})();
