import { NextResponse } from "next/server";
import type { ApiErrorShape } from "@/types/api";

export function jsonError(
  error: string,
  status: number,
  code?: string
) {
  const body: ApiErrorShape = code ? { error, code } : { error };
  return NextResponse.json(body, { status });
}

