export type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;
