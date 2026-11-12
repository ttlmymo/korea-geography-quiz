// topojson-client 3.1.0 에는 형 정의가 없다. 앱이 쓰는 두 함수만 적는다
declare module 'topojson-client' {
  export function feature(topology: unknown, object: unknown): any;
  export function mesh(topology: unknown, object?: unknown, filter?: (a: any, b: any) => boolean): any;
}
