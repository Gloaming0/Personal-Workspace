const deviceIdStorageKey = 'daily-work-os:device-id:v1'
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface DeviceIdentityProvider {
  getDeviceId(): string
}

export interface DeviceIdentityStoreOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  createId?: () => string
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  if (typeof window === 'undefined') {
    throw new Error('Device identity requires browser-local storage.')
  }
  return window.localStorage
}

export class DeviceIdentityStore implements DeviceIdentityProvider {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>
  private readonly createId: () => string

  constructor(options: DeviceIdentityStoreOptions = {}) {
    this.storage = options.storage ?? defaultStorage()
    this.createId = options.createId ?? (() => crypto.randomUUID())
  }

  getDeviceId(): string {
    const existing = this.storage.getItem(deviceIdStorageKey)
    if (existing && uuidPattern.test(existing)) return existing
    const created = this.createId()
    this.storage.setItem(deviceIdStorageKey, created)
    return created
  }
}

export class FixedDeviceIdentity implements DeviceIdentityProvider {
  constructor(private readonly deviceId: string) {}

  getDeviceId(): string {
    return this.deviceId
  }
}

export { deviceIdStorageKey }
