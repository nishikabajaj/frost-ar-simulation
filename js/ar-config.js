/* AR configuration. Everything marked PLACEHOLDER must be set once the
 * prototype and its markers exist. Units are centimetres. */
window.AR_CONFIG = {
  // PLACEHOLDER: printed width of the square marker (black border included).
  markerSizeCm: 5,

  // Standard AR.js markers for now. Swap `pattern` for your own .patt file later.
  // offsetCm = vector from the marker centre to the centre of the overlay
  //            (x to the right, y downward, in the marker's own plane).
  // PLACEHOLDER offsets: measure them on the real prototype.
  markers: {
    top:    { pattern: 'markers/patt.hiro',  offsetCm: { x: 0, y: 12 } },
    bottom: { pattern: 'markers/patt.kanji', offsetCm: { x: 0, y: -12 } }
  },

  // If both markers are visible, draw the overlay from this one.
  preferMarker: 'top',

  showDimensions: true,

  scripts: ['vendor/aframe.min.js', 'vendor/aframe-ar.js'],
  cameraParamsUrl: 'vendor/camera_para.dat'
};
