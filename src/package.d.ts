export default interface PackageJSON {
  name: string
  private?: boolean
  version: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
