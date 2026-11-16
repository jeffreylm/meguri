export const gradeControls = {
  exposure: { min: -4, max: 4, step: 0.05, neutral: 0 },
  contrast: { min: 0.5, max: 2, step: 0.01, neutral: 1 },
  pivot: { min: 0.04, max: 0.6, step: 0.01, neutral: 0.18 },
  saturation: { min: 0, max: 2, step: 0.01, neutral: 1 },
  temperature: { min: -100, max: 100, step: 1, neutral: 0 },
  tint: { min: -100, max: 100, step: 1, neutral: 0 },
} as const;

export type GradeControl = keyof typeof gradeControls;
export type VideoGrade = Record<GradeControl, number>;

export const gradeKeys = Object.keys(gradeControls) as GradeControl[];
export const neutralGrade: VideoGrade = {
  exposure: 0,
  contrast: 1,
  pivot: 0.18,
  saturation: 1,
  temperature: 0,
  tint: 0,
};

export function gradeChangesPicture(grade: VideoGrade): boolean {
  return gradeKeys.some(
    (key) => key !== "pivot" && grade[key] !== neutralGrade[key],
  );
}

interface GradePreferences {
  grade: VideoGrade;
  enabled: boolean;
}

export function readGrade(key: string): GradePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as
      (Partial<VideoGrade> & { enabled?: boolean }) | null;
    if (!saved) return { grade: neutralGrade, enabled: true };
    const grade = { ...neutralGrade };
    for (const key of gradeKeys) {
      const value = saved[key];
      const { min, max } = gradeControls[key];
      if (typeof value === "number" && Number.isFinite(value))
        grade[key] = Math.min(max, Math.max(min, value));
    }
    return { grade, enabled: saved.enabled !== false };
  } catch {
    return { grade: neutralGrade, enabled: true };
  }
}

export function saveGrade(
  key: string,
  { grade, enabled }: GradePreferences,
): void {
  try {
    if (enabled && gradeKeys.every((key) => grade[key] === neutralGrade[key]))
      localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ ...grade, enabled }));
  } catch {
    // The controls still work if storage is unavailable.
  }
}

export const exposureKnee = 0.5;
export const hdrReferenceWhiteNits = 203;
export const pqPeak = 10_000 / hdrReferenceWhiteNits;
export const hdrExposureKnee = 1;

export function exposureShoulder(
  gain: number,
  peak = 1,
  knee = exposureKnee,
): number {
  return gain > 1 ? 1 / (peak - knee) - 1 / (peak * gain - knee) : 0;
}

// In log-odds space the pivot is fixed and the multiplier sets the slope
// there. In linear light the toe and shoulder hold black and white.
export function filmicContrast(
  light: number,
  contrast: number,
  pivot: number,
): number {
  if (light <= 0 || light >= 1 || contrast === 1) return light;
  const origin = Math.log(pivot / (1 - pivot));
  const value = Math.log(light / (1 - light));
  return 1 / (1 + Math.exp(-(origin + contrast * (value - origin))));
}

type ToneGrade = Pick<VideoGrade, "exposure" | "contrast" | "pivot">;

// Neutral-color response of the shader: linear exposure with a soft shoulder,
// followed by contrast. Temperature, tint and saturation affect color.
export function videoToneCurve(
  light: number,
  grade: ToneGrade,
  hdr = false,
): number {
  const peak = hdr ? pqPeak : 1;
  const knee = hdr ? hdrExposureKnee : exposureKnee;
  const gain = 2 ** grade.exposure;
  const boosted = light * gain;
  const overKnee = Math.max(0, boosted - knee);
  const exposed =
    Math.min(boosted, knee) +
    overKnee / (1 + exposureShoulder(gain, peak, knee) * overKnee);
  return Math.min(
    peak,
    Math.max(
      0,
      filmicContrast(exposed / peak, grade.contrast, grade.pivot / peak) * peak,
    ),
  );
}

export function toneCurvePivotInput(grade: ToneGrade, hdr = false): number {
  if (hdr) return grade.pivot / 2 ** grade.exposure;
  const gain = 2 ** grade.exposure;
  if (grade.pivot <= exposureKnee) return grade.pivot / gain;
  // Invert the exposure shoulder to find the input that reaches the pivot.
  const overKnee = grade.pivot - exposureKnee;
  return (
    (exposureKnee + overKnee / (1 - exposureShoulder(gain) * overKnee)) / gain
  );
}
