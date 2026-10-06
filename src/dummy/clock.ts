export interface Clock {
  delay: number;
  sleep(ticks?: number): Promise<void>;
}

export function clock(delay: number): Clock {
  return {
    delay,
    sleep: (ticks = 1) => new Promise((resolve) => setTimeout(resolve, delay * ticks)),
  };
}
