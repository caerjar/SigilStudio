declare module "simplify-js" {
  interface Point {
    x: number;
    y: number;
  }
  export default function simplify<T extends Point>(
    points: T[],
    tolerance?: number,
    highQuality?: boolean,
  ): T[];
}
