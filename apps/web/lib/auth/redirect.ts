export function safeNextPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u0020]/.test(value) &&
    !/^\/sign-in(?:[/?#]|$)/.test(value)
    ? value
    : "/"
}
