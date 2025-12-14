export interface LoginSuccessResponse {
  exitCode: 0;
  token: string;
  id: number;
  name: string;
  email: string;
  nickname: string;
  rol: string | null;
  premium: boolean;
  verified: boolean;
}

export interface LoginErrorResponse {
  message: string;
  exitCode: number;
}

export type LoginResponse = LoginSuccessResponse | LoginErrorResponse;

export interface RegisterSuccessResponse {
  exitCode: 0;
  message?: string;
}

export interface RegisterErrorResponse {
  message: string;
  exitCode: number;
}

export type RegisterResponse = RegisterSuccessResponse | RegisterErrorResponse;
