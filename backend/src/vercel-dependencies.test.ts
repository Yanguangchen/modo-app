import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('loads Firebase and converts signing keys without require(ESM)', () => {
  // Reproduce Vercel's loader restriction, even on local Node versions that
  // normally allow require() to load an ES module.
  const output = execFileSync(process.execPath, [
    '--no-experimental-require-module', '--input-type=module', '-e', `
      import { createRequire } from 'node:module'
      import { generateKeyPairSync, createPublicKey } from 'node:crypto'
      import assert from 'node:assert/strict'
      import 'firebase-admin/auth'
      const require = createRequire(import.meta.url)
      const { retrieveSigningKeys } = require('jwks-rsa/src/utils')
      const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
      const keys = await retrieveSigningKeys([{
        ...publicKey.export({ format: 'jwk' }), kid: 'regression', alg: 'RS256', use: 'sig',
      }])
      assert.equal(keys.length, 1)
      assert.ok(createPublicKey(keys[0].getPublicKey()).equals(publicKey))
      const jwks = require('jwks-rsa')
      await new Promise((resolve, reject) => {
        jwks.passportJwtSecret({ jwksUri: 'https://example.invalid/jwks' })(
          null, 'malformed-token', (error, key) => {
            if (error || key !== null) reject(error ?? new Error('Invalid token accepted'))
            else resolve()
          },
        )
      })
      console.log('ok')
    `,
  ], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 10000 })
  expect(output.trim()).toBe('ok')
})
