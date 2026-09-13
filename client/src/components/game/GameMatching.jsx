import MatchingConnectorGame from "../MatchingConnectorGame";

// Shared Matching wrapper for live + assignment gameplay.
// pairs: [{ aIndex, bIndex }], onPairs(nextPairs, sorted by aIndex).
// shuffleKey feeds the connector's display shuffle; participantSeed further
// individualizes Column B order per student when provided.
export function GameMatching({ config, pairs, onPairs, disabled, shuffleKey, participantSeed = 0 }) {
  const map = Object.fromEntries((Array.isArray(pairs) ? pairs : []).map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
  function updateMap(nextMap) {
    const nextPairs = Object.entries(nextMap)
      .map(([aIndex, bIndex]) => ({ aIndex: Number(aIndex), bIndex: Number(bIndex) }))
      .sort((a, b) => a.aIndex - b.aIndex);
    onPairs(nextPairs);
  }
  return (
    <MatchingConnectorGame
      config={config}
      valueMap={map}
      onChange={updateMap}
      disabled={disabled}
      questionKey={shuffleKey}
      participantSeed={participantSeed}
    />
  );
}
