// Simplified anatomical-style coronary geometry for the 3D viewer.
// The paths are illustrative visualization coordinates, not patient-specific anatomy.

export const ARTERIES = {
  // Viewer-right / front: left anterior descending artery descending toward the apex.
  LAD: [
    [0.04, 0.58, 0.98],
    [0.10, 0.42, 1.02],
    [0.14, 0.22, 1.03],
    [0.15, 0.00, 1.00],
    [0.12, -0.22, 0.92],
    [0.07, -0.42, 0.78],
    [0.02, -0.62, 0.58],
    [-0.02, -0.78, 0.40],
  ],

  // Viewer-right / upper side: circumflex artery wrapping around the lateral surface.
  LCX: [
    [0.02, 0.60, 0.98],
    [0.22, 0.58, 0.99],
    [0.42, 0.50, 0.98],
    [0.60, 0.38, 0.93],
    [0.73, 0.23, 0.86],
    [0.79, 0.06, 0.76],
    [0.78, -0.12, 0.63],
  ],

  // Viewer-left: right coronary artery descending and curving around the right-heart border.
  RCA: [
    [-0.15, 0.55, 0.96],
    [-0.30, 0.53, 0.97],
    [-0.48, 0.44, 0.95],
    [-0.66, 0.30, 0.90],
    [-0.76, 0.12, 0.82],
    [-0.77, -0.10, 0.70],
    [-0.70, -0.32, 0.55],
    [-0.56, -0.50, 0.43],
  ],
};

export const BRANCHES = {
  LAD: [
    [[0.10, 0.42, 1.02], [0.27, 0.35, 0.96], [0.36, 0.25, 0.89]],
    [[0.14, 0.22, 1.03], [0.30, 0.12, 0.96], [0.39, 0.00, 0.88]],
    [[0.13, -0.10, 0.98], [0.29, -0.18, 0.89], [0.38, -0.29, 0.78]],
  ],
  LCX: [
    [[0.22, 0.58, 0.99], [0.30, 0.70, 0.86], [0.34, 0.80, 0.71]],
    [[0.50, 0.45, 0.97], [0.61, 0.56, 0.84], [0.67, 0.65, 0.70]],
  ],
  RCA: [
    [[-0.30, 0.53, 0.97], [-0.46, 0.66, 0.82], [-0.55, 0.73, 0.68]],
    [[-0.55, 0.39, 0.93], [-0.68, 0.45, 0.78], [-0.75, 0.53, 0.64]],
  ],
};

export const LESION_T = {
  LAD: 0.55,
  LCX: 0.50,
  RCA: 0.50,
};

export const TUBES = [
  {
    name: "Aorta",
    pts: [
      [-0.03, 0.60, 0.12],
      [-0.05, 0.92, 0.12],
      [0.04, 1.18, 0.08],
      [0.25, 1.34, 0.02],
      [0.55, 1.32, 0.00],
    ],
    radius: 0.17,
    color: "#c93448",
  },
  {
    name: "PulmonaryTrunk",
    pts: [
      [0.20, 0.45, 0.03],
      [0.30, 0.70, 0.02],
      [0.43, 0.90, 0.00],
    ],
    radius: 0.12,
    color: "#8e6bc7",
  },
  {
    name: "SVC",
    pts: [
      [-0.48, 1.10, 0.02],
      [-0.48, 0.83, 0.02],
      [-0.40, 0.62, 0.03],
    ],
    radius: 0.095,
    color: "#7b62bd",
  },
];

// Push a sphere into a broad, slightly tapered heart-like form.
export function deform(x, y, z) {
  const lowerTaper = 1 - Math.max(0, -y) * 0.16;
  const upperBulge = 1 + Math.max(0, y) * 0.08;
  return [
    x * 1.08 * lowerTaper * upperBulge,
    y * 1.13,
    z * 0.82,
  ];
}
