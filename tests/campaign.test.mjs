import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../assets/campaign.js', import.meta.url), 'utf8');
const campaign = runInNewContext(script + '\nWeldingCampaign');
const storage = () => {
    const state = new Map();
    return { getItem: key => state.get(key), setItem: (key, value) => state.set(key, value) };
};

test('campaign contains ten stages across the four pieces, with a two-piece final', () => {
    assert.equal(campaign.missions.length, 10);
    assert.equal(new Set(campaign.missions.map(mission => mission.piece)).size, 4);
    assert.equal(campaign.missions[9].secondPiece, 3);
    assert.deepEqual(Array.from(campaign.missions, mission => mission.minimum), [40, 50, 55, 60, 65, 65, 70, 75, 80, 85]);
});

test('sequential progression and rewards survive a save without rewarding replays twice', () => {
    const disk = storage();
    const profile = campaign.loadSave(disk);
    campaign.recordMission(profile, 1, 100, true, true);
    assert.equal(profile.records[1], undefined);
    campaign.recordMission(profile, 0, 39, false, false);
    assert.equal(campaign.unlocked(profile), 0);
    campaign.recordMission(profile, 0, 45, true, false);
    campaign.recordMission(profile, 0, 75, true, true);
    campaign.save(disk, profile);
    const restored = campaign.loadSave(disk);
    assert.equal(campaign.unlocked(restored), 1);
    assert.equal(restored.records[0].grade, 75);
    assert.equal(restored.records[0].star, true);
    assert.equal(restored.xp, 80);
    assert.equal(restored.credits, 50);
});

test('a stationary arc earns no points and farming one spot caps coverage and score', () => {
    const stationary = campaign.newTrace();
    const sample = { dt: 0.02, centered: true, paced: false, stability: 1, offset: 0, combo: 1 };
    for (let frame = 0; frame < 100; frame++) assert.equal(campaign.traceSample(stationary, 0.5, sample), 0);
    assert.ok(campaign.inspect(stationary, { volume: 2, precision: 100, thermal: 100 }).coverage <= 3);
    const repeated = campaign.newTrace();
    let points = 0;
    for (let frame = 0; frame < 150; frame++) points += campaign.traceSample(repeated, 0.5, { ...sample, paced: true });
    assert.ok(points <= 80.01);
});

test('empty, continuous and unstable traces produce distinct results', () => {
    const baseline = { volume: 50, precision: 100, thermal: 100 };
    const empty = campaign.inspect(campaign.newTrace(), baseline);
    assert.equal(empty.grade, 0);
    const steady = campaign.newTrace();
    const unstable = campaign.newTrace();
    for (let bin = 0; bin < 40; bin++) {
        const sample = { dt: 0.1, centered: true, paced: true, stability: 1, offset: 0, combo: 1 };
        campaign.traceSample(steady, (bin + 0.5) / 40, sample);
        campaign.traceSample(unstable, (bin + 0.5) / 40, { ...sample, stability: 0.52 });
    }
    assert.equal(campaign.inspect(steady, baseline).coverage, 100);
    assert.ok(campaign.inspect(steady, baseline).grade > campaign.inspect(unstable, baseline).grade);
    assert.equal(new Set(Object.values(campaign.rods).map(rod => rod.consumption)).size, 3);
});

test('a high grade alone does not satisfy a mission-specific minimum', () => {
    const mission = campaign.missions[6];
    assert.equal(campaign.passes(mission, { grade: 90, replacements: 0 }), false);
    assert.equal(campaign.passes(mission, { grade: 69, replacements: 1 }), false);
    assert.equal(campaign.passes(mission, { grade: 70, replacements: 1 }), true);
});

test('sensitivity defaults to 100 and persists with existing profiles', () => {
    const disk = storage();
    const profile = campaign.loadSave(disk);
    assert.equal(profile.settings.sensitivity, 100);
    profile.settings.sensitivity = 175;
    campaign.save(disk, profile);
    assert.equal(campaign.loadSave(disk).settings.sensitivity, 175);
});
