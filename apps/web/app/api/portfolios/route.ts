import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createPortfolio } from "../../../lib/api";

export async function POST(request: NextRequest) {
  const token = (await cookies()).get("token")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.url));

  const form = await request.formData();
  const name = String(form.get("name") ?? "My Portfolio");
  await createPortfolio(token, name);

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
