const fs = require('fs')
const path = require('path')

const PALETTE = ['#f97316', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#14b8a6', '#eab308', '#3b82f6']
function colorFor(seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
function initials(n) {
  return n.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const users = [
  ['alice', 'Alice Nguyen'],
  ['bob', 'Bob Marín'],
  ['carol', 'Carol Diaz'],
  ['dave', 'Dave Okafor']
]

const outDir = path.join(__dirname, '..', 'public', 'avatars')
fs.mkdirSync(outDir, { recursive: true })
for (const [username, name] of users) {
  const c = colorFor(username)
  const ini = initials(name)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${name}"><circle cx="32" cy="32" r="32" fill="${c}"/><text x="32" y="33" dominant-baseline="central" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="24" font-weight="600" fill="#ffffff">${ini}</text></svg>`
  fs.writeFileSync(path.join(outDir, `${username}.svg`), svg)
  console.log(username, ini, c)
}
