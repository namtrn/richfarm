export type PendulumParameters = {
  lengthMeters: number;
  massKg: number;
  angleDegrees: number;
  gravity: number;
};

export function periodSeconds({ lengthMeters, gravity }: PendulumParameters): number {
  if (lengthMeters <= 0 || gravity <= 0) throw new Error('Length and gravity must be positive');
  return 2 * Math.PI * Math.sqrt(lengthMeters / gravity);
}

export function angleAtTime(
  elapsedSeconds: number,
  parameters: PendulumParameters,
): number {
  const angularFrequency = Math.sqrt(parameters.gravity / parameters.lengthMeters);
  return parameters.angleDegrees * Math.cos(angularFrequency * elapsedSeconds);
}
