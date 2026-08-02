import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
/** 96 bits is the standard GCM nonce length. The previous 16 bytes worked but is
 *  non-interoperable and loses the counter-collision guarantees of the standard. */
const IV_LENGTH = 12
const LEGACY_IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16

const MAGIC = Buffer.from('PHBK')
const FORMAT_VERSION = 1
const KDF_ITERATIONS = 200_000
/** magic(4) + version(1) + iterations(4) */
const HEADER_LENGTH = 9

function deriveKey(password: string, salt: Buffer, iterations: number): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256')
}

/**
 * Encrypt with a self-describing container:
 *   [magic][version][iterations][salt][iv][tag][ciphertext]
 *
 * The header exists so the KDF cost can be raised later without orphaning
 * existing archives, and so a file that is not a PharmaPOS backup fails with a
 * clear message rather than an opaque OpenSSL error.
 */
export function encryptData(data: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt, KDF_ITERATIONS)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()

  const header = Buffer.alloc(HEADER_LENGTH)
  MAGIC.copy(header, 0)
  header.writeUInt8(FORMAT_VERSION, 4)
  header.writeUInt32BE(KDF_ITERATIONS, 5)

  return Buffer.concat([header, salt, iv, tag, encrypted])
}

export function decryptData(encryptedData: Buffer, password: string): Buffer {
  const hasHeader =
    encryptedData.length > HEADER_LENGTH && encryptedData.subarray(0, 4).equals(MAGIC)

  let offset = 0
  let iterations = 100_000 // what the headerless format always used
  let ivLength = LEGACY_IV_LENGTH

  if (hasHeader) {
    const version = encryptedData.readUInt8(4)
    if (version !== FORMAT_VERSION) {
      throw new Error(`Unsupported backup format (version ${version})`)
    }
    iterations = encryptedData.readUInt32BE(5)
    ivLength = IV_LENGTH
    offset = HEADER_LENGTH
  }

  const salt = encryptedData.subarray(offset, offset + SALT_LENGTH)
  const iv = encryptedData.subarray(offset + SALT_LENGTH, offset + SALT_LENGTH + ivLength)
  const tag = encryptedData.subarray(
    offset + SALT_LENGTH + ivLength,
    offset + SALT_LENGTH + ivLength + TAG_LENGTH
  )
  const encrypted = encryptedData.subarray(offset + SALT_LENGTH + ivLength + TAG_LENGTH)

  const key = deriveKey(password, salt, iterations)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}
