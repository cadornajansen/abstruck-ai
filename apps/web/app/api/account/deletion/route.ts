import { accountDataGet, accountDataPost } from "@/lib/account-data"
export const runtime = "nodejs"
export const GET = (request: Request): Promise<Response> =>
  accountDataGet(request, "deletion")
export const POST = (request: Request): Promise<Response> =>
  accountDataPost(request, "deletion")
