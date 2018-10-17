import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import * as semver from 'semver'
import * as cp from 'child_process'
import PackageJSON from './package'

type BumpFlag = 'major' | 'minor' | 'patch'

interface VersionLike {
  major: number
  minor: number
  patch: number
}

function toVersion(version: VersionLike): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

class Package implements VersionLike {
  previous: PackageJSON
  current: PackageJSON
  newVersion: string
  major: number
  minor: number
  patch: number

  constructor(base: string, name: string) {
    this.current = require(`${base}/${name}/package.json`)
    this.previous = JSON.parse(cp.execSync(`git show HEAD:${base}/${name}/package.json`).toString())
    this.major = semver.major(this.previous.version)
    this.minor = semver.minor(this.previous.version)
    this.patch = semver.patch(this.previous.version)
    this.newVersion = this.current.version
  }
  
  bump(flag: BumpFlag) {
    const result = {
      major: this.major,
      minor: this.minor,
      patch: this.patch,
    }
    result[flag] += 1
    if (flag !== 'patch') result.patch = 0
    if (flag === 'major') result.minor = 0
    if (semver.gt(toVersion(result), this.newVersion)) {
      this.newVersion = toVersion(result)
    }
  }

  toJSON() {
    this.current.version = this.newVersion
    return this.current
  }
}

interface ManagerOptions {
  baseDir?: string
}

let defaultManager: Manager = null

export default class Manager {
  names: string[]
  base: string
  fullBase: string
  pkgs: Record<string, Package> = {}

  constructor(options: ManagerOptions = {}) {
    defaultManager = this
    this.base = options.baseDir || 'packages'
    this.fullBase = path.resolve(process.cwd(), this.base)
    this.names = fs.readdirSync(this.fullBase)
    this.names.forEach(name => this.pkgs[name] = new Package(this.base, name))
  }

  bump(name: string, flag?: BumpFlag) {
    if (!(name in this.pkgs)) return
    this.pkgs[name].bump(flag || 'patch')
    const npmName = this.pkgs[name].current.name
    this.names.forEach((next) => {
      if (npmName in (this.pkgs[next].current.devDependencies || {})) {
        this.pkgs[next].current.devDependencies[npmName] = '^' + this.pkgs[name].newVersion
        this.bump(next)
      } else if (npmName in (this.pkgs[next].current.dependencies || {})) {
        this.pkgs[next].current.dependencies[npmName] = '^' + this.pkgs[name].newVersion
        this.bump(next)
      }
    })
  }  
}

interface BumpOptions extends ManagerOptions {
  bumpFlag?: BumpFlag
  packages: string[] | string
}

export function bump(options: BumpOptions) {
  const manager = defaultManager || new Manager(options)
  const names = options.packages instanceof Array ? options.packages : [options.packages]
  names.forEach(name => manager.bump(name, options.bumpFlag))
  return manager
}

interface PublishOptions extends ManagerOptions {}

export function publish(options: PublishOptions) {
  const manager = defaultManager || new Manager(options)
  let counter = 0, failed = 0
  let promise = Promise.resolve() as Promise<void | number>

  manager.names.forEach((name) => {
    if (manager.pkgs[name].newVersion !== manager.pkgs[name].previous.version) {
      fs.writeFileSync(manager.fullBase, JSON.stringify(manager.pkgs[name], null, 2))
      if (manager.pkgs[name].current.private) return
      const npmVersion = cp.execSync(`npm show ${manager.pkgs[name].current.name} version`).toString().trim()
      if (semver.gte(npmVersion, manager.pkgs[name].newVersion)) return
      console.log(` - ${name} (${manager.pkgs[name].current.name}): \
  ${chalk.green(npmVersion)} => \
  ${chalk.greenBright(manager.pkgs[name].newVersion)}`)
      counter += 1
      promise = promise.then((code: number) => {
        failed = failed || code
        return new Promise<number>((resolve, reject) => {
          const command = `cd ${manager.base}/${name} && npm publish`
          console.log(`${chalk.blue('$')} ${command}\n`)
          const child = cp.exec(command)
          child.stdout.pipe(process.stdout)
          child.stderr.pipe(process.stderr)
          child.on('close', (code) => resolve(code))
          child.on('error', (error) => reject(error))
        })
      })
    }
  })

  promise.then(() => {
    if (!counter) {
      console.log('No packages to publish.')
    } else if (failed) {
      console.log('Publish failed.')
    } else {
      console.log('Publish succeed.')
    }
  })
}
