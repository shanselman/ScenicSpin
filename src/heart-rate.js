(function attachHeartRateHelpers(root, factory) {
  const helpers = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = helpers;
  }

  if (root) {
    root.ScenicSpinHeartRate = helpers;
  }
})(typeof globalThis === 'object' ? globalThis : undefined, () => {
  const zoneBands = Object.freeze([
    Object.freeze({ id: 'zone1', number: 1, minimum: 0.5, maximum: 0.6 }),
    Object.freeze({ id: 'zone2', number: 2, minimum: 0.6, maximum: 0.7 }),
    Object.freeze({ id: 'zone3', number: 3, minimum: 0.7, maximum: 0.8 }),
    Object.freeze({ id: 'zone4', number: 4, minimum: 0.8, maximum: 0.9 }),
    Object.freeze({ id: 'zone5', number: 5, minimum: 0.9, maximum: 1.0 })
  ]);

  function toBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (!Array.isArray(value)) return null;
    if (value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
    return Uint8Array.from(value);
  }

  function parseHeartRateMeasurement(value) {
    const bytes = toBytes(value);
    if (!bytes || bytes.length < 2) return null;

    const usesSixteenBitValue = (bytes[0] & 0x01) !== 0;
    if (!usesSixteenBitValue) return bytes[1];
    if (bytes.length < 3) return null;
    return bytes[1] | (bytes[2] << 8);
  }

  function getHeartRateZone(bpm, maximumHeartRate) {
    if (!Number.isFinite(bpm) || bpm < 0 || !Number.isFinite(maximumHeartRate) || maximumHeartRate <= 0) {
      return null;
    }

    const ratio = bpm / maximumHeartRate;
    if (ratio < zoneBands[0].minimum) {
      return Object.freeze({ id: 'below', number: 0, ratio });
    }
    if (ratio > 1) {
      return Object.freeze({ id: 'above', number: 6, ratio });
    }

    const band = zoneBands.find(({ minimum, maximum }, index) =>
      ratio >= minimum && (index === zoneBands.length - 1 ? ratio <= maximum : ratio < maximum)
    );

    return band ? Object.freeze({ id: band.id, number: band.number, ratio }) : null;
  }

  return Object.freeze({
    getHeartRateZone,
    parseHeartRateMeasurement,
    zoneBands
  });
});
