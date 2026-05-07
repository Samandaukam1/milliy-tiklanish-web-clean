export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  console.log("native-intent", { path, initial });
  const authIndex = path.indexOf("auth/callback");
  if (authIndex >= 0) {
    const callbackPath = path.slice(authIndex);
    return `/${callbackPath.replace(/^\/+/, "")}`;
  }
  return "/";
}
