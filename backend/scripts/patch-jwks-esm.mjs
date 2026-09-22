import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Vercel's Node loader rejects require() of ESM. jwks-rsa (via firebase-admin)
// loads jose that way. Switch those two call sites to dynamic import().
const require = createRequire(import.meta.url)

function patch(file, transform) {
  let src
  try {
    src = readFileSync(require.resolve(file), 'utf8')
  } catch {
    return
  }
  const next = transform(src)
  if (next !== src) writeFileSync(require.resolve(file), next)
}

patch('jwks-rsa/src/utils.js', src => {
  if (!src.includes("const jose = require('jose');")) return src
  return src
    .replace("const jose = require('jose');\n", '')
    .replace(
      'async function retrieveSigningKeys(jwks) {\n',
      "async function retrieveSigningKeys(jwks) {\n  const jose = await import('jose');\n",
    )
})

patch('jwks-rsa/src/integrations/passport.js', src => {
  if (!src.includes("const jose = require('jose');")) return src
  return src
    .replace(
      "const jose = require('jose');\n",
      "let josePromise;\nconst loadJose = () => (josePromise ??= import('jose'));\n",
    )
    .replace(
      'return function secretProvider(req, rawJwtToken, cb) {\n',
      'return function secretProvider(req, rawJwtToken, cb) {\n    loadJose().then((jose) => {\n',
    )
    .replace(
      `    client.getSigningKey(decoded.header.kid)
      .then(key => {
        cb(null, key.publicKey || key.rsaPublicKey);
      }).catch(err => {
        onError(err, (newError) => cb(newError, null));
      });
  };
};`,
      `    client.getSigningKey(decoded.header.kid)
      .then(key => {
        cb(null, key.publicKey || key.rsaPublicKey);
      }).catch(err => {
        onError(err, (newError) => cb(newError, null));
      });
    }).catch(err => onError(err, (newError) => cb(newError, null)));
  };
};`,
    )
})
