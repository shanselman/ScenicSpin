const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getHeartRateZone,
  parseHeartRateMeasurement
} = require('../src/heart-rate');

test('parses 8-bit Heart Rate Measurement values', () => {
  assert.equal(parseHeartRateMeasurement([0x00, 146]), 146);
  assert.equal(parseHeartRateMeasurement(new DataView(Uint8Array.from([0x00, 72]).buffer)), 72);
});

test('parses 16-bit Heart Rate Measurement values', () => {
  assert.equal(parseHeartRateMeasurement([0x01, 0x2c, 0x01]), 300);
  assert.equal(parseHeartRateMeasurement(Uint8Array.from([0x01, 0xff, 0x00])), 255);
});

test('rejects malformed and truncated Heart Rate Measurement values', () => {
  for (const value of [null, {}, [], [0x00], [0x01, 0x2c], [0x00, -1], [0x00, 256]]) {
    assert.equal(parseHeartRateMeasurement(value), null);
  }
});

test('classifies explicit zone boundaries without a configured maximum fallback', () => {
  assert.equal(getHeartRateZone(100, null), null);
  assert.equal(getHeartRateZone(99, 200).id, 'below');
  assert.equal(getHeartRateZone(100, 200).id, 'zone1');
  assert.equal(getHeartRateZone(119, 200).id, 'zone1');
  assert.equal(getHeartRateZone(120, 200).id, 'zone2');
  assert.equal(getHeartRateZone(140, 200).id, 'zone3');
  assert.equal(getHeartRateZone(160, 200).id, 'zone4');
  assert.equal(getHeartRateZone(180, 200).id, 'zone5');
  assert.equal(getHeartRateZone(200, 200).id, 'zone5');
  assert.equal(getHeartRateZone(201, 200).id, 'above');
  assert.equal(getHeartRateZone(119, 199).id, 'zone1');
  assert.equal(getHeartRateZone(120, 199).id, 'zone2');
});
