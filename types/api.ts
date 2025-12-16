export type ApiErrorShape = {
  error: string;
  code?: string;
};

export type ApiSuccessShape<T> = T;

