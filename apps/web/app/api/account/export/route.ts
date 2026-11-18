import { accountDataGet, accountDataPost } from "@/lib/account-data"
export const runtime = "nodejs"
export const GET = (request: Request): Promise<Response> =>
  accountDataGet(request, "export")
export const POST = (request: Request): Promise<Response> =>
  accountDataPost(request, "export")
