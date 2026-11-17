/** True when the layout should collapse its side gutters and chrome for a narrow screen. */
export function isNarrowLayout() {
  return matchMedia("(max-width: 44rem)").matches
}

/** True when the primary input is a finger: on-screen controls, larger targets, touch gestures. */
export function isCoarsePointer() {
  return matchMedia("(pointer: coarse)").matches
}
