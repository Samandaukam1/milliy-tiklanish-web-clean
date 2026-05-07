// Allow TypeScript to import image assets used with require() / import
declare module "*.jpg" {
  const resource: number;
  export default resource;
}
declare module "*.jpeg" {
  const resource: number;
  export default resource;
}
declare module "*.png" {
  const resource: number;
  export default resource;
}
declare module "*.gif" {
  const resource: number;
  export default resource;
}
declare module "*.webp" {
  const resource: number;
  export default resource;
}
