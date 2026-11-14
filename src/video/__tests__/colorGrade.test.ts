import { describe, expect, it } from "vitest";
import { exposureKnee, exposureShoulder, filmicContrast } from "../colorGrade";

describe("preview color curves", () => {
  it("holds the pivot and endpoints while separating tones around the pivot", () => {
    const pivot = 0.18;
    expect(filmicContrast(0, 1.4, pivot)).toBe(0);
    expect(filmicContrast(pivot, 1.4, pivot)).toBeCloseTo(pivot, 12);
    expect(filmicContrast(1, 1.4, pivot)).toBe(1);
    expect(filmicContrast(0.12, 1.4, pivot)).toBeLessThan(0.12);
    expect(filmicContrast(0.24, 1.4, pivot)).toBeGreaterThan(0.24);
    const highlights = [0.7, 0.8, 0.9].map((x) =>
      filmicContrast(x, 1.4, pivot),
    );
    expect(highlights[0]).toBeLessThan(highlights[1]);
    expect(highlights[1]).toBeLessThan(highlights[2]);
    expect(highlights[2]).toBeLessThan(1);
  });

  it("lets exposure double linear light below the knee and rolls off brighter steps", () => {
    const gain = 2;
    const shoulder = exposureShoulder(gain);
    const curve = (input: number) => {
      const light = input * gain;
      const excess = Math.max(0, light - exposureKnee);
      return Math.min(light, exposureKnee) + excess / (1 + shoulder * excess);
    };
    expect(curve(0.18)).toBeCloseTo(0.36, 12);
    expect(curve(0.5)).toBeLessThan(curve(0.75));
    expect(curve(0.75)).toBeLessThan(curve(0.9));
    expect(curve(0.9)).toBeLessThan(curve(1));
    expect(curve(1)).toBeCloseTo(1, 12);
  });
});
